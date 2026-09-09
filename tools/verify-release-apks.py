#!/usr/bin/env python3
"""Verify existing release APKs against a signed immutable content snapshot.

This tool does not build, sign, change source files, or publish anything.
Only after both flavors pass are copies and checksums written to the output.
Requires Python 3, Node.js crypto, Android SDK aapt/apksigner, and a JDK.
"""
from pathlib import Path
import argparse
import base64
import collections
import datetime
import hashlib
import io
import json
import os
import re
import shutil
import struct
import subprocess
import zipfile
import xml.etree.ElementTree as ET

from android_apk_inspection import inspect_update_capabilities

ROOT = Path(__file__).resolve().parent.parent
CERTIFICATE = '806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777'
BRANDS = {'zh-CN': '玩吧', 'zh-TW': '玩吧', 'en': 'Nookcade', 'ja': 'ヌックケード', 'ko': '눅케이드'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def write_json(path, value):
    path.write_text(public_text(json.dumps(value, ensure_ascii=False, indent=2)) + '\n')


def public_text(value):
    # Keep diagnostics intact while making published locations repository-relative.
    return value.replace(str(ROOT) + '/', '').replace(str(Path.home()) + '/', '~/')


def execute(command, env=None):
    result = subprocess.run([str(arg) for arg in command], env=env, check=True, capture_output=True, text=True)
    return result.stdout + result.stderr


def verified_manifest(content, public_key):
    channel_bytes = (content / 'channel.json').read_bytes()
    channel = json.loads(channel_bytes)
    require(channel['schema'] == 1, 'Unexpected channel envelope schema')
    payload = base64.b64decode(channel['payload'], validate=True)
    manifest = json.loads((content / 'manifest.json').read_bytes())
    require(json.loads(payload) == manifest, 'Manifest differs from signed payload')
    result = execute(['node', '--input-type=module', '-e', """
import {readFileSync} from 'node:fs';
import {createPublicKey, verify} from 'node:crypto';
const envelope=JSON.parse(readFileSync(process.argv[1]));
const key=createPublicKey({key:readFileSync(process.argv[2]),format:'der',type:'spki'});
if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails.namedCurve!=='prime256v1')throw Error('Expected P-256 trust root');
if(!verify('sha256',Buffer.from(envelope.payload,'base64'),key,Buffer.from(envelope.signature,'base64')))throw Error('Content signature invalid');
process.stdout.write('P-256/SHA-256 verified');
""", content / 'channel.json', public_key])
    require(result == 'P-256/SHA-256 verified', 'Unexpected signature verification result')
    return manifest, channel_bytes, digest(payload)


def inspect_lint(path, evidence):
    issues = []
    for issue in ET.parse(path).getroot().findall('issue'):
        issues.append({'id': issue.get('id'), 'severity': issue.get('severity'), 'message': issue.get('message'),
                       'locations': [dict(location.attrib) for location in issue.findall('location')]})
    counts = collections.Counter(issue['severity'] for issue in issues)
    require(not counts['Error'] and not counts['Fatal'], f'Release lint errors: {path}')
    (evidence / path.name).write_text(public_text(path.read_text()))
    return {'errors': counts['Error'] + counts['Fatal'], 'warnings': counts['Warning'], 'issues': issues}


def inspect_source(root, manifest, expected):
    checked = []
    for path, metadata in expected.items():
        # prepare-android-assets.mjs copies these notices under a public license path.
        source = path.replace('licenses/space-cadet/', 'tools/space-cadet/', 1) if path.startswith('licenses/space-cadet/') else path
        data = (root/source).read_bytes()
        require(len(data) == metadata['size'] and digest(data) == metadata['sha256'], f'Current source differs from signed content: {source}')
        committed = subprocess.run(['git', 'show', f"{manifest['sourceCommit']}:{source}"], cwd=root,
                                   check=True, capture_output=True).stdout
        require(committed == data, f'Source commit differs from packaged source: {source}')
        checked.append({'packagePath': path, 'sourcePath': source, 'size': len(data), 'sha256': digest(data)})
    return checked


def inspect_apk(flavor, apk, args, manifest, channel, expected, package_versions, evidence, env):
    def android_tool(name, *parameters):
        return execute([args.sdk_build_tools / name, *parameters], env)

    signer = android_tool('apksigner', 'verify', '--verbose', '--print-certs', apk)
    require('Verified using v2 scheme (APK Signature Scheme v2): true' in signer, f'{flavor}: APK v2 signature invalid')
    certificates = re.findall(r'certificate SHA-256 digest: ([0-9a-f]+)', signer)
    require(certificates == [args.certificate], f'{flavor}: unexpected signing certificate(s)')
    badging = android_tool('aapt', 'dump', 'badging', apk)
    package_line = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    expected_package = 'io.github.jacklee992.wanba' + ('.compat' if flavor == 'compat' else '')
    require(package_line and package_line.groups() == (expected_package, str(args.code), args.version),
            f'{flavor}: APK package/version differs from requested release')
    xml = android_tool('aapt', 'dump', 'xmltree', apk, 'AndroidManifest.xml')
    for flag in ['debuggable', 'testOnly']:
        attribute = re.search(r'android:' + flag + r'[^\n]*', xml)
        require(not attribute or attribute.group().endswith('0x0'), f'{flavor}: android:{flag} enabled')
    require('application-debuggable' not in badging, f'{flavor}: aapt reports debuggable application')
    sdk = re.search(r"sdkVersion:'(\d+)'", badging)
    target = re.search(r"targetSdkVersion:'(\d+)'", badging)
    for name, value in [('apksigner', signer), ('badging', badging), ('manifest', xml)]:
        (evidence / f'{flavor}-{name}.txt').write_text(value)

    checked, native, languages, brands = [], [], {}, {}
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), f'{flavor}: duplicate ZIP entries')
        updates = inspect_update_capabilities(archive, xml, badging,
                    expect_app=args.expect_app_updater, expect_games=args.expect_game_updates,
                    public_key=args.app_updater_public_key.read_bytes() if args.expect_app_updater else None)
        if updates['checked']:
            require(updates['hostVersionCode'] == args.code and updates['hostVersionName'] == args.version,
                    f'{flavor}: actual DEX BuildConfig version differs from release manifest')
            write_json(evidence / f'{flavor}-update-capabilities.json', updates)
        www = {name.removeprefix('assets/www/') for name in names if name.startswith('assets/www/') and not name.endswith('/')}
        require(www == set(expected), f'{flavor}: www missing={sorted(set(expected)-www)}, extra={sorted(www-set(expected))}')
        for path, metadata in expected.items():
            data = archive.read('assets/www/' + path)
            actual_hash = digest(data)
            require(len(data) == metadata['size'] and actual_hash == metadata['sha256'], f'{flavor}: content mismatch {path}')
            checked.append({'path': path, 'size': len(data), 'sha256': actual_hash})
        require(archive.read('assets/content-update/builtin-channel.json') == channel, f'{flavor}: built-in channel mismatch')
        require(archive.read('assets/content-update/public-key.der') == args.public_key.read_bytes(), f'{flavor}: trust root mismatch')
        for locale, brand in BRANDS.items():
            data = json.loads(archive.read(f'assets/www/locales/{locale}.json'))
            require(data['version'] == package_versions[manifest['locales'][locale]], f'{flavor}: locale version mismatch {locale}')
            require(data['locale'] == locale and set(data['games']) == set(manifest['games']), f'{flavor}: game titles mismatch {locale}')
            require(brand in json.dumps(data['brand'], ensure_ascii=False), f'{flavor}: brand mismatch {locale}')
            languages[locale] = {'version': data['version'], 'gameTitles': len(data['games']), 'brand': data['brand']}
        for path in ['assets/app-brand/app-icon.png', 'assets/app-brand/international/app-icon.png']:
            data = archive.read('assets/www/' + path)
            require(data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) > 10000, f'{flavor}: invalid brand PNG {path}')
            brands[path] = {'bytes': len(data), 'sha256': digest(data)}
        libraries = [name for name in names if name.startswith('lib/') and name.endswith('.so')]
        gecko = None
        if flavor == 'compat':
            require({name.split('/')[1] for name in libraries} == {'arm64-v8a', 'armeabi-v7a'}, 'Unexpected compat ABIs')
            for path in libraries:
                data = archive.read(path)
                require(data[:4] == b'\x7fELF' and len(data) > 1000 and data[5] == 1, f'Invalid ELF library: {path}')
                machine = struct.unpack_from('<H', data, 18)[0]
                require(machine == {'arm64-v8a': 183, 'armeabi-v7a': 40}[path.split('/')[1]], f'Wrong ELF architecture: {path}')
                native.append({'path': path, 'bytes': len(data), 'elfMachine': machine, 'sha256': digest(data)})
            require(all(f'lib/{abi}/libxul.so' in libraries for abi in ['arm64-v8a', 'armeabi-v7a']), 'Missing Gecko native libraries')
            with zipfile.ZipFile(io.BytesIO(archive.read('assets/omni.ja'))) as omni:
                constants = omni.read('modules/AppConstants.sys.mjs').decode()
            version = re.search(r'MOZ_APP_VERSION: "([^"]+)"', constants).group(1)
            build_id = re.search(r'MOZ_BUILDID: "([^"]+)"', constants).group(1)
            require(version == args.gecko_version and build_id == args.gecko_build_id, 'Packaged Gecko version mismatch')
            (evidence / 'gecko-app-constants.txt').write_text('\n'.join(line for line in constants.splitlines() if 'MOZ_APP_VERSION' in line or 'MOZ_BUILDID' in line) + '\n')
            gecko = {'packagedVersion': version, 'buildId': build_id, 'mavenCoordinate': f'org.mozilla.geckoview:geckoview:155.0.{build_id}'}
        else:
            require(not libraries and 'assets/omni.ja' not in names, 'System flavor unexpectedly bundles Gecko')
    lint = inspect_lint(args.lint_dir / f'lint-results-{flavor}Release.xml', evidence)
    write_json(evidence / f'{flavor}-www-checks.json', checked)
    return {'flavor': flavor, 'file': f'wanba-{flavor}-{args.version}.apk', 'bytes': apk.stat().st_size,
            'sha256': file_digest(apk), 'package': expected_package, 'versionName': args.version, 'versionCode': args.code,
            'minSdk': int(sdk.group(1)), 'targetSdk': int(target.group(1)), 'debuggable': False, 'testOnly': False,
            'certificateSha256': certificates[0], 'signatureScheme': 'v2', 'wwwFilesMatched': len(checked),
            'extraWwwFiles': 0, 'builtinChannelMatched': True, 'languages': languages, 'brandAssets': brands,
            'nativeLibraries': native, 'gecko': gecko, 'lint': lint, 'updateCapabilities': updates}


def write_document(args, report):
    entries = report['apks']
    rows = '\n'.join(f"| `{entry['file']}` | {entry['bytes']:,} 字节 | `{entry['package']}` | {'Gecko '+entry['gecko']['packagedVersion'] if entry['gecko'] else '系统 WebView'} |" for entry in entries)
    checksums = '\n'.join(f"{entry['sha256']}  {entry['file']}" for entry in entries)
    lint = '；'.join(f"{entry['flavor']}：{entry['lint']['errors']} 错误、{entry['lint']['warnings']} 警告" for entry in entries)
    locale_versions = '、'.join(f"{locale} {data['version']}" for locale, data in entries[0]['languages'].items())
    native_count = len(next(entry for entry in entries if entry['flavor'] == 'compat')['nativeLibraries'])
    evidence = os.path.relpath(args.evidence_dir, args.document.parent)
    updates = entries[0]['updateCapabilities']
    updater_summary = ('本次调用未指定更新模块构建预期，保留历史验收范围。' if not updates['checked'] else
                       '已从实际 DEX 读取构建开关：' + '、'.join(f"`{key}={str(value).lower()}`" for key, value in updates['flags'].items()) + '。')
    if updates.get('expectedAppUpdater') is True:
        updater_summary += (' 两包均实际包含整包更新器及 APK 签名验证类、安装权限和模块内置 P-256 公钥；更新 Activity 与安装结果 Receiver 均明确未导出。公钥字节与指定信任根一致，详细 DEX、组件和公钥摘要已归档。')
    elif updates.get('expectedAppUpdater') is False:
        updater_summary += ' 两包均未包含整包更新器、apksig 类、安装权限、更新组件或专用公钥。'
    text = f'''# 玩吧 {args.version} 正式 APK 完整性验收

{report['verifiedAtUtc']}：两种正式 APK 均通过。本验收读取最终二进制和签名资源清单，没有构建、修改源码或发布 GitHub。

| 产物 | 大小 | 应用包名 | 内核 |
| --- | ---: | --- | --- |
{rows}

两包的二进制 manifest 均为 `versionName={args.version}`、`versionCode={args.code}`；未启用 `android:debuggable` 或 `android:testOnly`。APK v2 签名校验通过，发布证书 SHA-256 为 `{args.certificate}`。

{updater_summary}

## 内置内容

`{report['contentRelease']}` 的 P-256/SHA-256 签名已使用 APK 编译信任根独立验证，`manifest.json` 与已签名 payload 完全相同。序列 **{report['sequence']}**，内容快照版本 **{report['contentSnapshotVersion']}**，来源提交 `{report['sourceCommit']}`。

逐一核对两包 `assets/www/` 的 **{report['packages']} 个资源包、每个 APK {report['filesPerApk']} 个文件**：字节数及 SHA-256 全部相同，无缺失、额外或重复文件。两包内置 channel 与签名发布 channel 字节一致，公钥与信任根一致。

{'同一批 ' + str(report['sourceFilesMatched']) + ' 个文件也逐项对照当前工作区与上述 Git 提交中的真实 blob，全部一致；原始许可证文件按构建脚本的路径映射核验。' if report.get('sourceFilesMatched') else '此调用未额外对照工作区及 Git 源文件。'}

五语言包为 {locale_versions}；各自的 {report['gameCount']} 个游戏标题与签名清单一致。玩吧、Nookcade、ヌックケード、눅케이드 品牌和两套 app-icon PNG 已实际入包。

兼容版实际包含 {native_count} 个 ARM ELF 动态库，两种 ABI `arm64-v8a` / `armeabi-v7a` 均有 `libxul.so`。已核对 ELF 架构头，并读取包内 `omni.ja`：Gecko `{args.gecko_version}`、build `{args.gecko_build_id}`。系统版没有内置 Gecko 动态库。

## lint 与验收边界

Release lint：{lint}。原始报告和全部警告已归档，没有屏蔽诊断。{'构建日志含 BUILD SUCCESSFUL，已归档。' if args.build_log else '此调用未提供构建日志。'}

本报告验证正式 APK 签名、版本、资源和内核组成；触控、横竖屏、存档和热更新体验由对应真机/模拟器记录说明。

## SHA-256

```text
{checksums}
```

两个 APK 全部通过后才拷贝到 `{os.path.relpath(args.output, ROOT)}/`，拷贝后再次校验 SHA-256。

- [机器可读验收报告]({evidence}/apk-integrity.json)
- [签名、二进制 manifest、逐文件核对和 lint 原始证据]({evidence}/)
- [发布 SHA256SUMS]({evidence}/SHA256SUMS)
- [可复用验收工具](../tools/verify-release-apks.py)
'''
    args.document.parent.mkdir(parents=True, exist_ok=True)
    args.document.write_text(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', required=True)
    parser.add_argument('--code', type=int, required=True)
    parser.add_argument('--sequence', type=int, required=True)
    parser.add_argument('--content', type=Path, required=True)
    parser.add_argument('--system-apk', type=Path, default=ROOT/'android/app/build/outputs/apk/system/release/app-system-release.apk')
    parser.add_argument('--compat-apk', type=Path, default=ROOT/'android/app/build/outputs/apk/compat/release/app-compat-release.apk')
    parser.add_argument('--sdk-build-tools', type=Path, default=Path.home()/'Library/Android/sdk/build-tools/37.0.0')
    parser.add_argument('--java-home', default=os.environ.get('JAVA_HOME', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'))
    parser.add_argument('--public-key', type=Path, default=ROOT/'android/app/src/main/assets/content-update/public-key.der')
    parser.add_argument('--expect-app-updater', choices=['enabled', 'disabled'], help='Verify the actual optional APK updater classes, flags, permission, private components and trust root')
    parser.add_argument('--expect-game-updates', choices=['enabled', 'disabled'], help='Verify the game-content update flag in the actual APK DEX')
    parser.add_argument('--app-updater-public-key', type=Path, default=ROOT/'android/app-updater/src/main/assets/app-updater/public-key.der')
    parser.add_argument('--certificate', default=CERTIFICATE)
    parser.add_argument('--gecko-version', default='155.0.1')
    parser.add_argument('--gecko-build-id', default='20260903215306')
    parser.add_argument('--lint-dir', type=Path, default=ROOT/'android/app/build/reports')
    parser.add_argument('--build-log', type=Path)
    parser.add_argument('--source-root', type=Path, help='Also compare every packaged file with this checkout and the signed sourceCommit')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--evidence-dir', type=Path)
    parser.add_argument('--document', type=Path)
    args = parser.parse_args()
    args.expect_app_updater = None if args.expect_app_updater is None else args.expect_app_updater == 'enabled'
    args.expect_game_updates = None if args.expect_game_updates is None else args.expect_game_updates == 'enabled'
    if args.expect_app_updater:
        # Validate the separate module trust root itself, not only an equal byte string in the APK.
        key_type = execute(['node', '--input-type=module', '-e', """
import {readFileSync} from 'node:fs'; import {createPublicKey} from 'node:crypto';
const key=createPublicKey({key:readFileSync(process.argv[1]),format:'der',type:'spki'});
if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails.namedCurve!=='prime256v1')throw Error('Expected P-256 updater trust root');
process.stdout.write('P-256 updater trust root verified');
""", args.app_updater_public_key])
        require(key_type == 'P-256 updater trust root verified', 'Invalid updater trust root')
    require(re.fullmatch(r'\d+\.\d+\.\d+', args.version) is not None and args.code > 0 and args.sequence > 0, 'Invalid release version/code/sequence')
    args.output = args.output or ROOT/f'.local/releases/v{args.version}'
    args.evidence_dir = args.evidence_dir or ROOT/f'docs/evidence/android-{args.version}/release-integrity'
    args.document = args.document or ROOT/f'docs/release-v{args.version}-integrity.md'
    manifest, channel, snapshot_id = verified_manifest(args.content, args.public_key)
    require(manifest['sequence'] == args.sequence and manifest['releaseTag'] == f'content-{args.sequence}', 'Wrong signed content sequence')
    require(manifest['minAppVersionCode'] <= args.code, 'Content is incompatible with the requested APK code')
    require(len(manifest['games']) == 37, 'Expected all 37 games')
    require(set(manifest['locales']) == set(BRANDS), 'Expected all five language packages')
    expected = {file['path']: file for package in manifest['packages'] for file in package['files']}
    require(len(expected) == sum(len(package['files']) for package in manifest['packages']), 'Duplicate packaged files')
    package_versions = {package['id']: package['version'] for package in manifest['packages']}
    require(len(package_versions) == len(manifest['packages']), 'Duplicate package IDs')
    if args.build_log:
        require('BUILD SUCCESSFUL' in args.build_log.read_text(), 'Build log does not report success')
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    source_checked = inspect_source(args.source_root, manifest, expected) if args.source_root else []
    if source_checked:
        write_json(args.evidence_dir/'source-checks.json', source_checked)
    report = {'verifiedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'versionName': args.version,
              'versionCode': args.code, 'contentRelease': manifest['releaseTag'], 'sequence': manifest['sequence'],
              'contentSnapshotVersion': manifest['snapshotVersion'], 'sourceCommit': manifest['sourceCommit'],
              'snapshotId': snapshot_id, 'contentSignatureVerified': True,
              'manifestSha256': file_digest(args.content/'manifest.json'), 'builtinChannelSha256': digest(channel),
              'publicKeySha256': file_digest(args.public_key), 'packages': len(manifest['packages']),
              'packageVersions': package_versions, 'gameCount': len(manifest['games']), 'filesPerApk': len(expected),
              'sourceFilesMatched': len(source_checked), 'apks': []}
    env = dict(os.environ, JAVA_HOME=args.java_home)
    sources = {'system': args.system_apk, 'compat': args.compat_apk}
    for flavor, apk in sources.items():
        report['apks'].append(inspect_apk(flavor, apk, args, manifest, channel, expected, package_versions, args.evidence_dir, env))
    # Never emit a release copy until every check for both flavors has succeeded.
    args.output.mkdir(parents=True, exist_ok=True)
    for entry in report['apks']:
        destination = args.output/entry['file']
        shutil.copy2(sources[entry['flavor']], destination)
        require(file_digest(destination) == entry['sha256'], f'Copied APK differs: {destination}')
    report['passed'] = True
    sums = ''.join(f"{entry['sha256']}  {entry['file']}\n" for entry in report['apks'])
    for directory in [args.output, args.evidence_dir]:
        write_json(directory/'apk-integrity.json', report)
        (directory/'SHA256SUMS').write_text(sums)
    if args.build_log:
        (args.evidence_dir/'build.log').write_text(public_text(args.build_log.read_text()))
    write_document(args, report)
    print(json.dumps({'passed': True, 'sequence': report['sequence'], 'packages': report['packages'],
                      'filesPerApk': report['filesPerApk'], 'apks': [{key: entry[key] for key in
                      ['flavor', 'file', 'bytes', 'sha256', 'debuggable', 'gecko']} for entry in report['apks']]}, indent=2))


if __name__ == '__main__':
    main()

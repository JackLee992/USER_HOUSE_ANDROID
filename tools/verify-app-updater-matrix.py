#!/usr/bin/env python3
"""Read final APKs; never build, install, publish, or overwrite release artifacts."""
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SDK = Path('/Users/jacklee/Library/Android/sdk/build-tools/37.0.0')
ENV = dict(os.environ, JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home')
CERT = '806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777'
EVIDENCE = ROOT / 'docs/evidence/app-updater/build-matrix'
EVIDENCE.mkdir(parents=True, exist_ok=True)
PUBLISHED = ROOT / '.local/releases/v1.2.1'

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for data in iter(lambda: f.read(1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()

def command(args):
    return subprocess.run([str(x) for x in args], check=True, capture_output=True, text=True, env=ENV).stdout

def uleb(data, pos):
    value, shift = 0, 0
    while True:
        b = data[pos]
        pos += 1
        value |= (b & 127) << shift
        if not b & 128:
            return value, pos
        shift += 7
        assert shift <= 35

def dex_classes(data):
    assert data[:4] == b'dex\n'
    u32 = lambda off: struct.unpack_from('<I', data, off)[0]
    strings = []
    for i in range(u32(56)):
        _, pos = uleb(data, u32(u32(60) + i * 4))
        strings.append(data[pos:data.index(b'\0', pos)].decode('utf-8', errors='replace'))
    types = [strings[u32(u32(68) + i * 4)] for i in range(u32(64))]
    fields = [struct.unpack_from('<HHI', data, u32(84) + i * 8) for i in range(u32(80))]

    def encoded_value(pos):
        head = data[pos]
        pos += 1
        typ, arg = head & 31, head >> 5
        if typ == 0x1f:
            return bool(arg), pos
        if typ == 0x1e:
            return None, pos
        if typ == 0x1c:
            n, pos = uleb(data, pos)
            result = []
            for _ in range(n):
                value, pos = encoded_value(pos)
                result.append(value)
            return result, pos
        assert typ != 0x1d, 'Unexpected annotation in host BuildConfig'
        value = int.from_bytes(data[pos:pos + arg + 1], 'little')
        pos += arg + 1
        return (strings[value] if typ == 0x17 else value), pos

    classes, config = [], None
    for i in range(u32(96)):
        off = u32(100) + i * 32
        name = types[u32(off)]
        classes.append(name)
        if name != 'Lio/github/jacklee992/wanba/BuildConfig;':
            continue
        pos = u32(off + 24)
        counts = []
        for _ in range(4):
            value, pos = uleb(data, pos)
            counts.append(value)
        names, index = [], 0
        for _ in range(counts[0]):
            diff, pos = uleb(data, pos)
            _, pos = uleb(data, pos)
            index += diff
            _, typ, name_index = fields[index]
            names.append((strings[name_index], types[typ]))
        value_off = u32(off + 28)
        values = []
        if value_off:
            count, pos = uleb(data, value_off)
            for _ in range(count):
                value, pos = encoded_value(pos)
                values.append(value)
        config = {key: (values[i] if i < len(values) else (False if typ == 'Z' else 0)) for i, (key, typ) in enumerate(names)}
    return classes, config

def components(xmltree):
    result, current = [], None
    for line in xmltree.splitlines():
        element = re.match(r'(\s*)E: (\S+)', line)
        if element:
            indent = len(element[1])
            if current and indent <= current['_indent']:
                result.append(current)
                current = None
            if element[2] in ('activity', 'receiver', 'service', 'provider'):
                current = {'type': element[2], '_indent': indent}
        if current:
            name = re.search(r'A: android:name\([^)]*\)="([^"]+)"', line)
            exported = re.search(r'A: android:exported\([^)]*\)=\(type 0x12\)0x([a-f0-9]+)', line)
            if name and 'name' not in current:
                current['name'] = name[1]
            if exported:
                current['exported'] = int(exported[1], 16) != 0
    if current:
        result.append(current)
    return [{k: v for k, v in item.items() if k != '_indent'} for item in result]

published_before = {p.name: sha(p) for p in PUBLISHED.glob('*.apk')}
matrix = []
for enabled, flavor, build_type in [(True, 'system', 'debug'), (True, 'compat', 'debug'), (False, 'system', 'release'), (False, 'compat', 'release'), (False, 'system', 'debug')]:
    mode = 'enabled' if enabled else 'disabled'
    label = f'{mode}-{flavor}-{build_type}'
    source = ROOT / (f'.local/qa-app-updater/enabled/wanba-{flavor}-debug.apk' if enabled else f'android/app/build/outputs/apk/{flavor}/{build_type}/app-{flavor}-{build_type}.apk')
    target = ROOT / f'.local/qa-app-updater/{mode}/wanba-{flavor}-{build_type}.apk'
    if not enabled:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        assert sha(source) == sha(target)
    manifest = command([SDK / 'aapt', 'dump', 'xmltree', target, 'AndroidManifest.xml'])
    badging = command([SDK / 'aapt', 'dump', 'badging', target])
    signing = command([SDK / 'apksigner', 'verify', '--verbose', '--print-certs', target])
    for suffix, content in [('manifest.txt', manifest), ('badging.txt', badging), ('apksigner.txt', signing)]:
        (EVIDENCE / f'{label}.{suffix}').write_text(content)
    pkg = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    signer = re.search(r'certificate SHA-256 digest: (\w+)', signing)[1]
    assert signer == CERT, (label, signer)
    assert 'Number of signers: 1' in signing
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in signing
    assert pkg.groups()[1:] == ('4', '1.2.1'), pkg.groups()
    assert pkg[1] == 'io.github.jacklee992.wanba' + ('.compat' if flavor == 'compat' else '')
    debug = 'application-debuggable' in badging
    assert debug == (build_type == 'debug')
    permission = "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'" in badging
    assert permission == enabled, (label, permission)
    all_components = components(manifest)
    module_components = [c for c in all_components if '.appupdater.' in c.get('name', '')]
    assert len(module_components) == (2 if enabled else 0), module_components
    assert all(c.get('exported') is False for c in module_components), module_components
    classes, configs, dex_info = [], [], []
    with zipfile.ZipFile(target) as apk:
        dex_names = sorted(n for n in apk.namelist() if re.fullmatch(r'classes\d*\.dex', n))
        for name in dex_names:
            data = apk.read(name)
            names, config = dex_classes(data)
            classes.extend(names)
            if config is not None:
                configs.append(config)
            dex_info.append({'name': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'classCount': len(names)})
        assert len(configs) == 1, configs
        flags = {k: configs[0][k] for k in ('WANBA_GAME_UPDATES', 'WANBA_APP_UPDATER')}
        assert flags == {'WANBA_GAME_UPDATES': enabled, 'WANBA_APP_UPDATER': enabled}, (label, flags)
        updater = sorted(n for n in classes if n.startswith('Lio/github/jacklee992/wanba/appupdater/'))
        apksig = sorted(n for n in classes if n.startswith('Lcom/android/apksig/'))
        assert bool(updater) == enabled, (label, len(updater))
        assert bool(apksig) == enabled, (label, len(apksig))
        assets = sorted(n for n in apk.namelist() if n.startswith('assets/app-updater/'))
        assert assets == (['assets/app-updater/public-key.der'] if enabled else []), (label, assets)
        asset_hash = hashlib.sha256(apk.read(assets[0])).hexdigest() if assets else None
        if enabled:
            assert asset_hash == sha(ROOT / 'android/app-updater/src/main/assets/app-updater/public-key.der')
        game_modules = sorted(n for n in apk.namelist() if re.fullmatch(r'assets/www/src/games/plugins/[^/]+/index\.js', n))
        locales = sorted(n for n in apk.namelist() if re.fullmatch(r'assets/www/locales/(zh-CN|zh-TW|en|ja|ko)\.json', n))
        assert len(game_modules) == 37 and len(locales) == 5, (label, len(game_modules), len(locales))
    dex_record = {'method': 'DEX class_def table and host BuildConfig encoded static values, not text search', 'hostEncodedStaticValues': {k: v for k, v in configs[0].items() if k != 'DEBUG'}, 'debugFieldNote': 'DEBUG is initialized by <clinit> in debug builds; debuggable is verified from the packaged manifest, not encoded defaults', 'dex': dex_info, 'updaterClasses': updater, 'apkSignatureVerifierClasses': apksig}
    (EVIDENCE / f'{label}.dex.json').write_text(json.dumps(dex_record, indent=2) + '\n')
    matrix.append({'mode': mode, 'flavor': flavor, 'buildType': build_type, 'source': str(source.relative_to(ROOT)), 'artifact': str(target.relative_to(ROOT)), 'bytes': target.stat().st_size, 'sha256': sha(target), 'packageName': pkg[1], 'versionName': pkg[3], 'versionCode': int(pkg[2]), 'certificateSha256': signer, 'debuggable': debug, 'flags': flags, 'installPackagesPermission': permission, 'updaterComponents': module_components, 'updaterClassCount': len(updater), 'apkSignatureVerifierClassCount': len(apksig), 'updaterAssets': assets, 'updaterPublicKeySha256': asset_hash, 'builtinGameModuleCount': len(game_modules), 'builtinLocales': locales, 'evidencePrefix': str((EVIDENCE / label).relative_to(ROOT))})
    print(json.dumps(matrix[-1]), flush=True)

lint = {}
for flavor in ('system', 'compat'):
    source = ROOT / f'android/app/build/reports/lint-results-{flavor}Release.xml'
    issues = ET.parse(source).getroot().findall('issue')
    counts = dict(collections.Counter(item.get('severity') for item in issues))
    assert counts.get('Error', 0) == 0 and counts.get('Fatal', 0) == 0
    target = EVIDENCE / source.name
    shutil.copy2(source, target)
    lint[flavor] = {'configuration': 'disabled release', 'counts': counts, 'issues': dict(collections.Counter(item.get('id') for item in issues)), 'evidence': str(target.relative_to(ROOT))}
logs = {}
for mode in ('enabled', 'disabled'):
    source = ROOT / f'.local/qa-app-updater/build-{mode}.log'
    content = source.read_text()
    assert 'BUILD SUCCESSFUL' in content and 'BUILD FAILED' not in content
    target = EVIDENCE / source.name
    shutil.copy2(source, target)
    logs[mode] = {'evidence': str(target.relative_to(ROOT)), 'sha256': sha(target), 'result': re.search(r'BUILD SUCCESSFUL[^\n]*', content)[0], 'lintTasks': re.findall(r'> Task ([^\s]*lint[^\s]*)', content, flags=re.I)}
published_after = {p.name: sha(p) for p in PUBLISHED.glob('*.apk')}
assert published_before == published_after
record = {'schema': 1, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'purpose': 'Post-release source build candidates only; same version 1.2.1/code 4 is NOT a newly published release. No APK installed or uploaded.', 'verified': True, 'builds': matrix, 'lint': lint, 'buildLogs': logs, 'publishedReleaseFilesUntouched': published_after, 'limits': ['ON variants are debug verification APKs; ON release/lint was not run by these build logs.', 'This inspection verifies packaged capabilities and removal; it does not replace on-device installer/lifecycle testing.', 'No claim of Google Play approval.'], 'inspectionScript': 'tools/verify-app-updater-matrix.py'}
(EVIDENCE.parent / 'build-matrix.json').write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n')
for mode in ('enabled', 'disabled'):
    items = [m for m in matrix if m['mode'] == mode]
    (ROOT / f'.local/qa-app-updater/{mode}/SHA256SUMS').write_text(''.join(m['sha256'] + '  ' + Path(m['artifact']).name + '\n' for m in items))
print('PASS: matrix, copies, flags, removal, signatures, lint, published files unchanged', flush=True)

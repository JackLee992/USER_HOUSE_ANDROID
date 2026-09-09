"""Small read-only APK/DEX helpers used by release integrity checks.

The caller verifies the APK signature first. DEX class definitions and encoded
static values are parsed directly; class-name strings alone are insufficient.
"""
import hashlib
import re
import struct


def require(condition, message):
    if not condition:
        raise ValueError(message)


def uleb(data, pos):
    value, shift = 0, 0
    while True:
        b = data[pos]
        pos += 1
        value |= (b & 127) << shift
        if not b & 128:
            return value, pos
        shift += 7
        require(shift <= 35, 'Invalid DEX ULEB128')


def dex_classes(data):
    require(data[:4] == b'dex\n', 'Invalid DEX magic')
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
        require(typ != 0x1d, 'Unexpected annotation in host BuildConfig')
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


def inspect_update_capabilities(archive, manifest, badging, expect_app=None, expect_games=None, public_key=None):
    """Optional strict flags check; None retains historical verifier behavior."""
    if expect_app is None and expect_games is None:
        return {'checked': False}
    classes, configs, dex = [], [], []
    for name in sorted(n for n in archive.namelist() if re.fullmatch(r'classes\d*\.dex', n)):
        data = archive.read(name)
        names, config = dex_classes(data)
        classes.extend(names)
        if config is not None:
            configs.append(config)
        dex.append({'path': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'classCount': len(names)})
    require(len(configs) == 1, 'Expected exactly one host BuildConfig in actual DEX')
    config = configs[0]
    for key, expected in [('WANBA_APP_UPDATER', expect_app), ('WANBA_GAME_UPDATES', expect_games)]:
        if expected is not None:
            require(config.get(key) is expected, f'Actual DEX {key} differs from requested build')
    flags = {key: config.get(key) for key in ('WANBA_APP_UPDATER', 'WANBA_GAME_UPDATES')}
    updater = sorted(name for name in classes if name.startswith('Lio/github/jacklee992/wanba/appupdater/'))
    apksig = sorted(name for name in classes if name.startswith('Lcom/android/apksig/'))
    installed = "uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'" in badging
    module_components = [item for item in components(manifest) if '.appupdater.' in item.get('name', '')]
    assets = sorted(name for name in archive.namelist() if name.startswith('assets/app-updater/'))
    key_hash = None
    if expect_app is not None:
        require(installed is expect_app, 'REQUEST_INSTALL_PACKAGES differs from requested updater capability')
        if expect_app:
            prefix = 'io.github.jacklee992.wanba.appupdater.'
            expected_components = {('activity', prefix + 'AppUpdateActivity'), ('receiver', prefix + 'InstallResultReceiver')}
            require(len(module_components) == 2 and {(item['type'], item['name']) for item in module_components} == expected_components,
                    'Updater activity/receiver missing, duplicated or unexpected')
            require(all(item.get('exported') is False for item in module_components), 'Updater component must explicitly be non-exported')
            required = {'L' + prefix.replace('.', '/') + name + ';' for name in
                        ['AppUpdateActivity', 'InstallResultReceiver', 'UpdateController', 'UpdateProtocol', 'UpdateHttp', 'UpdateFiles', 'ApkChecks']}
            require(required.issubset(updater), 'Updater implementation classes missing from actual DEX')
            require('Lcom/android/apksig/ApkVerifier;' in apksig, 'APK signature verifier missing from actual DEX')
            require(assets == ['assets/app-updater/public-key.der'], 'Updater trust-root asset missing or unexpected')
            require(public_key is not None and archive.read(assets[0]) == public_key, 'Updater public key differs from expected trust root')
            key_hash = hashlib.sha256(public_key).hexdigest()
        else:
            require(not updater and not apksig, 'Disabled updater still bundles implementation/signature classes')
            require(not module_components and not assets, 'Disabled updater still bundles components/assets')
    return {'checked': True, 'expectedAppUpdater': expect_app, 'expectedGameUpdates': expect_games,
            'flags': flags, 'hostVersionCode': config.get('VERSION_CODE'), 'hostVersionName': config.get('VERSION_NAME'),
            'installPackagesPermission': installed, 'components': module_components, 'updaterClasses': updater,
            'apkSignatureVerifierClasses': apksig, 'assets': assets, 'publicKeySha256': key_hash, 'dex': dex}

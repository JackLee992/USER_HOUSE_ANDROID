"""Integration tests using the ON/OFF APK matrix in .local/qa-app-updater.

Run tools/verify-app-updater-matrix.py first to preserve binary manifest evidence.
These tests never build, install or alter an APK. Missing local APKs are skipped.
"""
import pathlib
import sys
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools'))
from android_apk_inspection import inspect_update_capabilities, dex_classes


class AlteredArchive:
    def __init__(self, original, hide=None, replace=None):
        self.original, self.hide, self.replace = original, hide or set(), replace or {}

    def namelist(self):
        return [n for n in self.original.namelist() if n not in self.hide]

    def read(self, name):
        return self.replace[name] if name in self.replace else self.original.read(name)


@unittest.skipUnless((ROOT/'.local/qa-app-updater/enabled/wanba-system-debug.apk').is_file(), 'Requires preserved local ON/OFF APK matrix')
class Capabilities(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = (ROOT/'android/app-updater/src/main/assets/app-updater/public-key.der').read_bytes()
        cls.inputs = {}
        for mode, flavor, kind in [('enabled', 'system', 'debug'), ('enabled', 'compat', 'debug'), ('disabled', 'system', 'release'), ('disabled', 'compat', 'release')]:
            prefix = ROOT/f'docs/evidence/app-updater/build-matrix/{mode}-{flavor}-{kind}'
            archive = zipfile.ZipFile(ROOT/f'.local/qa-app-updater/{mode}/wanba-{flavor}-{kind}.apk')
            cls.inputs[mode, flavor] = archive, pathlib.Path(str(prefix)+'.manifest.txt').read_text(), pathlib.Path(str(prefix)+'.badging.txt').read_text()

    @classmethod
    def tearDownClass(cls):
        for archive, _, _ in cls.inputs.values():
            archive.close()

    def call(self, mode='enabled', flavor='system', **changes):
        archive, manifest, badging = self.inputs[mode, flavor]
        args = dict(archive=archive, manifest=manifest, badging=badging, expect_app=mode == 'enabled', expect_games=mode == 'enabled', public_key=self.key)
        args.update(changes)
        return inspect_update_capabilities(**args)

    def test_legacy_skips_new_requirements(self):
        self.assertEqual(inspect_update_capabilities(None, '', ''), {'checked': False})

    def test_enabled_system(self):
        actual = self.call()
        self.assertEqual(len(actual['updaterClasses']), 30)
        self.assertEqual(actual['hostVersionCode'], 4)

    def test_enabled_compat(self):
        self.assertEqual(len(self.call(flavor='compat')['apkSignatureVerifierClasses']), 297)

    def test_disabled_system(self):
        self.assertEqual(self.call(mode='disabled')['updaterClasses'], [])

    def test_disabled_compat(self):
        self.assertEqual(self.call(mode='disabled', flavor='compat')['assets'], [])

    def test_reject_wrong_updater_flag(self):
        with self.assertRaisesRegex(ValueError, 'WANBA_APP_UPDATER'):
            self.call(expect_app=False)

    def test_reject_wrong_game_flag(self):
        with self.assertRaisesRegex(ValueError, 'WANBA_GAME_UPDATES'):
            self.call(expect_games=False)

    def test_reject_wrong_key(self):
        with self.assertRaisesRegex(ValueError, 'public key'):
            self.call(public_key=b'wrong')

    def test_reject_missing_key(self):
        archive = self.inputs['enabled', 'system'][0]
        with self.assertRaisesRegex(ValueError, 'trust-root asset'):
            self.call(archive=AlteredArchive(archive, hide={'assets/app-updater/public-key.der'}))

    def test_reject_exported_updater(self):
        manifest = self.inputs['enabled', 'system'][1].replace('android:exported(0x01010010)=(type 0x12)0x0', 'android:exported(0x01010010)=(type 0x12)0xffffffff')
        with self.assertRaisesRegex(ValueError, 'non-exported'):
            self.call(manifest=manifest)

    def test_reject_missing_permission(self):
        badging = self.inputs['enabled', 'system'][2].replace('android.permission.REQUEST_INSTALL_PACKAGES', 'removed.permission')
        with self.assertRaisesRegex(ValueError, 'REQUEST_INSTALL_PACKAGES'):
            self.call(badging=badging)

    def test_reject_signature_implementation_missing(self):
        archive = self.inputs['enabled', 'system'][0]
        hidden = {name for name in archive.namelist() if name.startswith('classes') and name.endswith('.dex') and 'Lcom/android/apksig/ApkVerifier;' in dex_classes(archive.read(name))[0]}
        self.assertTrue(hidden)
        with self.assertRaisesRegex(ValueError, 'signature verifier missing'):
            self.call(archive=AlteredArchive(archive, hide=hidden))


if __name__ == '__main__':
    unittest.main(verbosity=2)

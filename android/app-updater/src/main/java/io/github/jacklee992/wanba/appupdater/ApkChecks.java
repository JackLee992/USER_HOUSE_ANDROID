package io.github.jacklee992.wanba.appupdater;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.util.concurrent.atomic.AtomicBoolean;

final class ApkChecks {
    static long version(PackageInfo p) { return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode; }
    static PackageInfo installed(Context c) throws Exception {
        return c.getPackageManager().getPackageInfo(c.getPackageName(), Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
    }
    static String signer(PackageInfo p) throws Exception {
        android.content.pm.Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? p.signingInfo.getApkContentsSigners() : p.signatures;
        UpdateProtocol.require(signatures != null && signatures.length == 1, "Single signer required; key rotation needs a protocol upgrade");
        return UpdateFiles.hash(signatures[0].toByteArray());
    }
    static void verify(Context context, File apk, UpdateProtocol.Entry entry, AtomicBoolean cancel) throws Exception {
        UpdateFiles.check(cancel);
        UpdateProtocol.require(apk.isFile() && apk.length() == entry.full.size && UpdateFiles.hash(apk, cancel).equals(entry.full.hash), "APK hash mismatch");
        PackageInfo current = installed(context);
        UpdateProtocol.require(entry.packageName.equals(context.getPackageName()) && entry.versionCode > version(current), "APK is not a newer version of this application");
        UpdateProtocol.require(entry.minSdk <= Build.VERSION.SDK_INT && entry.signer.equals(signer(current)), "SDK or installed signer mismatch");
        ApkVerifier.Result signed = new ApkVerifier.Builder(apk).setMinCheckedPlatformVersion(26).setMaxCheckedPlatformVersion(Build.VERSION.SDK_INT).build().verify();
        UpdateFiles.check(cancel);
        UpdateProtocol.require(signed.isVerified() && (signed.isVerifiedUsingV2Scheme() || signed.isVerifiedUsingV3Scheme()), "Full APK signature rejected");
        UpdateProtocol.require(signed.getSignerCertificates().size() == 1 && UpdateFiles.hash(signed.getSignerCertificates().get(0).getEncoded()).equals(entry.signer), "APK certificate mismatch");
        PackageInfo archive = context.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        UpdateProtocol.require(archive != null && archive.applicationInfo != null && archive.packageName.equals(entry.packageName)
                && version(archive) == entry.versionCode && entry.versionName.equals(archive.versionName)
                && archive.applicationInfo.minSdkVersion == entry.minSdk, "APK package/version/SDK metadata mismatch");
        UpdateProtocol.require((archive.applicationInfo.flags & (android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE | android.content.pm.ApplicationInfo.FLAG_TEST_ONLY)) == 0, "Debug/test APK rejected");
    }
}

import java.util.Properties
import javax.inject.Inject
import org.gradle.api.DefaultTask
import org.gradle.api.file.ConfigurableFileCollection
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction
import org.gradle.process.ExecOperations

plugins { id("com.android.application") }

val webRoot = rootProject.projectDir.parentFile
val generatedWebAssets = layout.buildDirectory.dir("generated/wanbaAssets")
val signingFile = providers.gradleProperty("wanbaSigningProperties")
    .map { file(it) }.getOrElse(webRoot.resolve(".local/signing.properties"))
val releaseSigning = Properties().apply {
    if (signingFile.isFile) signingFile.inputStream().use { load(it) }
}

android {
    namespace = "io.github.jacklee992.wanba"
    compileSdk { version = release(37) { minorApiLevel = 1 } }
    defaultConfig {
        applicationId = "io.github.jacklee992.wanba"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "1.2.1"
    }
    flavorDimensions += "engine"
    productFlavors {
        create("system") { dimension = "engine" }
        create("compat") {
            dimension = "engine"
            applicationIdSuffix = ".compat"
            // Both mobile ARM architectures; desktop emulator libraries stay out of the download.
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        }
    }
    buildFeatures { buildConfig = true }
    if (signingFile.isFile) {
        signingConfigs.create("localRelease") {
            storeFile = file(requireNotNull(releaseSigning.getProperty("storeFile")) { "Signing storeFile missing" })
            storePassword = requireNotNull(releaseSigning.getProperty("storePassword")) { "Signing storePassword missing" }
            keyAlias = requireNotNull(releaseSigning.getProperty("keyAlias")) { "Signing keyAlias missing" }
            keyPassword = requireNotNull(releaseSigning.getProperty("keyPassword")) { "Signing keyPassword missing" }
        }
    }
    buildTypes {
        debug {
            isDebuggable = true
            if (signingFile.isFile) signingConfig = signingConfigs.getByName("localRelease")
        }
        release {
            isDebuggable = false
            isMinifyEnabled = false
            if (signingFile.isFile) signingConfig = signingConfigs.getByName("localRelease")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    androidResources { noCompress += listOf("wasm", "data", "dat", "wav") }
    // Compress the large bundled engine in APKs; Android extracts the selected ABI at install.
    packaging { jniLibs.useLegacyPackaging = true }
}

dependencies {
    "compatImplementation"("org.mozilla.geckoview:geckoview:155.0.20260903215306")
}

abstract class PrepareWanbaAssets : DefaultTask() {
    @get:InputFiles abstract val sourceFiles: ConfigurableFileCollection
    @get:InputFile abstract val prepareScript: RegularFileProperty
    @get:Input abstract val nodeBinary: Property<String>
    @get:Internal abstract val sourceRoot: DirectoryProperty
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @get:Inject abstract val execOperations: ExecOperations

    @TaskAction fun prepare() {
        execOperations.exec {
            workingDir(sourceRoot.get().asFile)
            commandLine(nodeBinary.get(), prepareScript.get().asFile.absolutePath, "--output", outputDirectory.get().dir("www").asFile.absolutePath)
        }
    }
}
val prepareWebAssets by tasks.registering(PrepareWanbaAssets::class) {
    description = "Copy only offline game runtime assets into the APK staging directory."
    group = "build"
    sourceRoot.set(webRoot)
    prepareScript.set(webRoot.resolve("scripts/prepare-android-assets.mjs"))
    nodeBinary.set(providers.gradleProperty("nodeBinary").orElse("node"))
    sourceFiles.from(webRoot.resolve("style.css"))
    for (path in listOf("src", "standalone", "locales", "assets/game-icons", "assets/game-art", "assets/space-cadet", "assets/app-brand", "tools/space-cadet")) sourceFiles.from(fileTree(webRoot.resolve(path)))
    outputDirectory.set(generatedWebAssets)
}
androidComponents {
    onVariants(selector().all()) { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(prepareWebAssets, PrepareWanbaAssets::outputDirectory)
    }
}
tasks.named("preBuild").configure { dependsOn(prepareWebAssets) }

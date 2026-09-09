plugins { id("com.android.library") }

android {
    namespace = "io.github.jacklee992.wanba.appupdater"
    compileSdk { version = release(37) { minorApiLevel = 1 } }
    defaultConfig { minSdk = 26; consumerProguardFiles("consumer-rules.pro") }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies {
    implementation("com.android.tools.build:apksig:9.2.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google(); mavenCentral()
        maven {
            url = uri("https://maven.mozilla.org/maven2/")
            content { includeGroup("org.mozilla.geckoview") }
        }
    }
}
rootProject.name = "Wanba"
include(":app")
// Distribution-only installer code is absent, including its manifest permissions, by default.
if (providers.gradleProperty("wanbaAppUpdater").orElse("false").get().toBooleanStrict()) {
    include(":app-updater")
}

plugins { id("com.android.application") }
android {
    namespace = "com.kennethyepez.defendercompanion"
    compileSdk = 36
    defaultConfig { applicationId = "com.kennethyepez.defendercompanion"; minSdk = 26; targetSdk = 36; versionCode = 2; versionName = "1.0.1"; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    signingConfigs {
        create("privateRelease") {
            val file = System.getenv("DEFENDER_ANDROID_KEYSTORE")
            if (file != null) {
                storeFile = rootProject.file(file)
                storePassword = System.getenv("DEFENDER_ANDROID_STORE_PASSWORD")
                keyAlias = "defender-companion"
                keyPassword = System.getenv("DEFENDER_ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release { isMinifyEnabled = true; isShrinkResources = true; signingConfig = signingConfigs.getByName("privateRelease"); proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") }
    }
    lint { abortOnError = true; checkReleaseBuilds = true }
}
dependencies {
    implementation("androidx.activity:activity:1.12.0")
    implementation("androidx.webkit:webkit:1.18.0")
    implementation("androidx.browser:browser:1.10.0")
    implementation("androidx.camera:camera-camera2:1.5.3")
    implementation("androidx.camera:camera-lifecycle:1.5.3")
    implementation("androidx.camera:camera-view:1.5.3")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    testImplementation("junit:junit:4.13.2")
}

# Android test app

The signed Android app keeps the approved English interface and includes the 46-screen fictional workspace offline. The launcher uses the app’s shield/check icon, including adaptive and themed variants. Minimum Android 8 (API 26), target Android 16 (API 36).

## Connect a private workspace

1. Connect the phone to the same authorized private network as the workspace.
2. On the authenticated workspace, open **More → Data connections → Show connection QR**.
3. In Android, choose **Scan connection QR**, then **Use camera** or **Choose QR image**. Alternatively, enter the private HTTPS address.
   4ירן+4. Check the address and choose **Open private workspace**. The app validates the service over normal system-trusted TLS, then asks before opening the browser. Sign in with your passkey there.

The QR contains only the workspace origin: no Microsoft credentials, bootstrap token, session cookie, recovery code or passkey. Scanning never opens a URL or initiates a connection by itself. Only strict HTTPS `.ts.net` origins and allowed ports are accepted. Redirects, credentials, paths, query strings and fragments are rejected. Network failures remain errors; the offline demo is never presented as real tenant data.

Private access uses the browser’s real WebAuthn/passkey flow in a Custom Tab. This release does not copy a browser session into the native app, implement an embedded sign-in WebView, or contain Microsoft API credentials. A working private server and owner enrollment are prerequisites for real data. Installing the APK does not install or activate that server.

## Device access and data

- Camera is the only runtime permission. Internet and network-state access support private connections and bundled SDK operation. Camera access is requested only after **Use camera**; declining it preserves image selection and manual entry.
- Camera scanning uses the bundled ML Kit model. Frames and selected QR images are processed locally and are not saved by this app. ML Kit may collect operational SDK/device metrics under its own privacy terms; no claim of zero SDK telemetry is made.
- The system document picker grants access only to the selected QR image or selected demo export destination. No storage, contact, microphone or notification permission is requested.
- The native app saves the workspace address only. Authentication remains in the browser. The offline demo’s fictional notes and preferences stay in its separate local WebView storage.
- The offline renderer loads packaged assets only. Network resources, mixed content, pop-ups, file/content access, cookies and runtime permissions are blocked. Its export bridge accepts only bounded fictional snapshots from the exact asset origin and main frame.
- App backup is disabled. Human sign-in and recovery remain owner actions.

## Build and sign

Use Node 24+, JDK 17, Android SDK 36, Gradle 9.6.1 and the committed wrapper. Android dependencies are pinned in the app build file; SDK paths belong in ignored `android/local.properties`.

```text
npm ci
npm run build:android-web
cd android
gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

Release signing reads `DEFENDER_ANDROID_KEYSTORE`, `DEFENDER_ANDROID_STORE_PASSWORD` and `DEFENDER_ANDROID_KEY_PASSWORD` from the environment, alias `defender-companion`. Supply your own protected update key. Never commit keys, passwords, private addresses, generated APKs, SDK files or local deployment material.

```text
gradlew :app:assembleRelease :app:lintRelease
```

Inspect the resulting APK with the Android SDK’s `apksigner verify --verbose --print-certs` and `aapt2 dump badging`. Actual device acceptance must cover launch, camera permission and cancellation, QR decoding and rejection, manual address errors, navigation/back behavior and document export. A successful build alone does not prove those flows or a live Defender connection.

## Primary implementation references

- [Android local WebView content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [Passkey architectures](https://developer.android.com/identity/passkeys/architecture)
- [ML Kit bundled barcode scanning](https://developers.google.com/ml-kit/vision/barcode-scanning/android)
- [CameraX](https://developer.android.com/jetpack/androidx/releases/camera)
- [AndroidX Activity](https://developer.android.com/jetpack/androidx/releases/activity)

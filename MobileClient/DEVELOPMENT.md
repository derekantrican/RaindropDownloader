# RaindropDownloader — Mobile Client Development Guide

## Overview

The mobile client is a **React Native 0.74** app targeting Android. It connects to the [Raindrop.io](https://raindrop.io) API to fetch bookmarked videos and downloads them using [yt-dlp](https://github.com/yt-dlp/yt-dlp) (via the [youtubedl-android](https://github.com/yausername/youtubedl-android) library embedded as a native module).

## Prerequisites

| Tool              | Tested Version   | Notes                                      |
|-------------------|------------------|--------------------------------------------|
| Node.js           | v24.x            | LTS recommended                            |
| npm               | 11.x             | Comes with Node                            |
| Java (JDK)        | 17 (OpenJDK)     | Required by Gradle — JDK 17 specifically   |
| Android SDK       | API 34           | Install via Android Studio                 |
| Android NDK       | 26.1.10909125    | Install via Android Studio SDK Manager     |
| Android Build Tools | 34.0.0         | Install via Android Studio SDK Manager     |
| Gradle            | 8.6              | Auto-downloaded by the Gradle wrapper      |

### Environment Variables

Set `ANDROID_HOME` to your Android SDK path. On Windows this is typically:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

Or permanently via System Properties → Environment Variables:
```
ANDROID_HOME = C:\Users\<you>\AppData\Local\Android\Sdk
```

Make sure `ANDROID_HOME\platform-tools` and `ANDROID_HOME\tools` are on your `PATH`.

## Project Structure

```
MobileClient/
├── App.js                  # Root component (navigation + StatusBar)
├── index.js                # Entry point
├── package.json            # Dependencies & scripts
├── metro.config.js         # Metro bundler config
├── babel.config.js         # Babel config
├── android/                # Native Android project (Gradle)
│   ├── build.gradle        # Root Gradle config (SDK versions, Kotlin)
│   ├── gradle/wrapper/     # Gradle wrapper (v8.6)
│   └── app/
│       ├── build.gradle    # App-level Gradle config
│       └── src/main/java/com/raindropdownloadertemp/
│           ├── MainApplication.kt
│           ├── MainActivity.kt
│           ├── YtDlpModule.kt       # Native bridge for yt-dlp downloads
│           └── DownloadService.kt   # Background download service
└── src/
    ├── screens/
    │   ├── HomeScreen.js       # Main screen (bookmarks list, download queue, progress)
    │   └── SettingsScreen.js   # Settings (token, download location, quality, etc.)
    └── services/
        ├── api.js              # Raindrop.io API client
        └── download.js         # Download orchestration (calls native YtDlpModule)
```

## First-Time Setup

1. **Clone the repo and navigate to the mobile client:**
   ```bash
   git clone https://github.com/derekantrican/RaindropDownloader.git
   cd RaindropDownloader/MobileClient
   ```

2. **Install npm dependencies:**
   ```bash
   npm install
   ```

3. **Verify Android SDK is available:**
   ```powershell
   # Should print the SDK path
   echo $env:ANDROID_HOME
   # Should list installed platforms
   ls "$env:ANDROID_HOME\platforms"
   ```

## Building the APK

### Release APK (recommended — bundles JS, no Metro server needed)

```powershell
cd MobileClient\android
.\gradlew.bat assembleRelease --no-daemon
```

**Output location:**
```
MobileClient\android\app\build\outputs\apk\release\app-release.apk
```

> **Note:** The release build is currently signed with the debug keystore. For Play Store distribution, you'll need to generate a proper signing key. See [React Native Signed APK docs](https://reactnative.dev/docs/signed-apk-android).

### Debug APK (requires Metro server for JS)

```powershell
cd MobileClient\android
.\gradlew.bat assembleDebug --no-daemon
```

**Output location:**
```
MobileClient\android\app\build\outputs\apk\debug\app-debug.apk
```

### Clean Build (if you encounter stale cache issues)

```powershell
cd MobileClient\android
.\gradlew.bat clean --no-daemon
.\gradlew.bat assembleRelease --no-daemon
```

### Full Clean (nuclear option)

```powershell
cd MobileClient
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force android\.gradle
Remove-Item -Recurse -Force android\app\build
npm install
cd android
.\gradlew.bat assembleRelease --no-daemon
```

## Installing on a Device

```powershell
# Via adb (device must be connected with USB debugging enabled)
adb install MobileClient\android\app\build\outputs\apk\release\app-release.apk

# Or just copy the .apk to your phone and open it
```

## Running with Metro (Development)

For live-reload development with a connected device or emulator:

```bash
cd MobileClient

# Terminal 1: Start Metro bundler
npx react-native start

# Terminal 2: Build and install debug APK
npx react-native run-android
```

## App Configuration

The app uses a Raindrop.io **test token** for authentication (no OAuth flow):

1. Go to https://app.raindrop.io/settings/integrations
2. Click "Create test token" under your app
3. Open the app → Settings → paste the token

## Key Build Configuration

| Setting           | Value                          | File                          |
|-------------------|--------------------------------|-------------------------------|
| `compileSdkVersion` | 34                           | `android/build.gradle`        |
| `targetSdkVersion`  | 34                           | `android/build.gradle`        |
| `minSdkVersion`     | 24 (Android 7.0)             | `android/build.gradle`        |
| `ndkVersion`         | 26.1.10909125                | `android/build.gradle`        |
| `kotlinVersion`      | 1.9.22                       | `android/build.gradle`        |
| `Gradle`             | 8.6                          | `gradle/wrapper/gradle-wrapper.properties` |
| ABI filters          | x86, x86_64, armeabi-v7a, arm64-v8a | `android/app/build.gradle` |

## Troubleshooting

### "SDK location not found"
Set `ANDROID_HOME` environment variable (see Prerequisites above).

### Gradle build fails with Java version errors
Ensure you're using **JDK 17**. Check with `java -version`. If you have multiple JDKs, set `JAVA_HOME`:
```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.x.x.x-hotspot"
```

### "Unable to load script" error on debug builds
Debug builds require the Metro bundler running. Either:
- Start Metro with `npx react-native start`, or
- Build a release APK instead (JS is bundled into the APK).

### Clean Gradle caches if builds behave unexpectedly
```powershell
cd MobileClient\android
.\gradlew.bat clean --no-daemon
```

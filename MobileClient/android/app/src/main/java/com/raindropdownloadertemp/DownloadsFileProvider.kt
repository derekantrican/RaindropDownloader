package com.raindropdownloadertemp

import androidx.core.content.FileProvider

// Own subclass so it doesn't collide with react-native-webview's FileProvider in the merged manifest
class DownloadsFileProvider : FileProvider()

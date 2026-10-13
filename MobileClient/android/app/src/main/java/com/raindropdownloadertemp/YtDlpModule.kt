package com.raindropdownloadertemp

import com.facebook.react.bridge.*
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLException
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.media.ThumbnailUtils
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Size
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "YtDlpModule"

    @ReactMethod
    fun getVideoInfo(url: String, promise: Promise) {
        Thread {
            try {
                val info = YoutubeDL.getInstance().getInfo(url)
                val result = Arguments.createMap().apply {
                    putString("title", info.title ?: "")
                    putString("uploader", info.uploader ?: "")
                    putInt("duration", info.duration)
                    putString("thumbnail", info.thumbnail ?: "")
                    putString("ext", info.ext ?: "mp4")
                    putString("url", info.url ?: "")
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("YTDLP_INFO_ERROR", e.message ?: "Failed to get video info", e)
            }
        }.start()
    }

    @ReactMethod
    fun download(url: String, title: String, processId: String, options: ReadableMap?, promise: Promise) {
        Thread {
            try {
                val outputDir = options?.getString("outputDir")
                    ?: Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath
                val format = options?.getString("format")
                    ?: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
                val sponsorBlock = options?.getBoolean("sponsorBlock") ?: false
                val preciseCuts = options?.getBoolean("preciseCuts") ?: false

                val dir = File(outputDir)
                if (!dir.exists()) dir.mkdirs()

                val request = YoutubeDLRequest(url)
                request.addOption("-f", format)
                request.addOption("-o", "${dir.absolutePath}/%(title)s.%(ext)s")
                request.addOption("--no-mtime")
                request.addOption("--restrict-filenames")
                request.addOption("--no-update")
                request.addOption("--extractor-args", "youtube:player_client=android,web")

                if (sponsorBlock) {
                    request.addOption("--sponsorblock-remove", "all")
                    if (preciseCuts) {
                        // Forces a full re-encode so cuts land exactly; very slow on mobile CPUs.
                        request.addOption("--force-keyframes-at-cuts")
                    }
                }

                val response = YoutubeDL.getInstance().execute(
                    request,
                    processId,
                    false
                ) { progress, eta, line ->
                    val params = Arguments.createMap().apply {
                        putDouble("progress", progress.toDouble() / 100.0)
                        putDouble("eta", eta.toDouble())
                        putString("processId", processId)
                        putString("line", line)
                    }
                    sendEvent("YtDlpProgress", params)
                }

                val result = Arguments.createMap().apply {
                    putBoolean("success", response.exitCode == 0)
                    putInt("exitCode", response.exitCode)
                    putString("out", response.out)
                    putString("err", response.err)
                }
                promise.resolve(result)
            } catch (e: YoutubeDL.CanceledException) {
                promise.reject("YTDLP_CANCELLED", "Download cancelled", e)
            } catch (e: Exception) {
                promise.reject("YTDLP_DOWNLOAD_ERROR", e.message ?: "Download failed", e)
            }
        }.start()
    }

    @ReactMethod
    fun cancelDownload(processId: String, promise: Promise) {
        val result = YoutubeDL.getInstance().destroyProcessById(processId)
        promise.resolve(result)
    }

    @ReactMethod
    fun updateYtDlp(promise: Promise) {
        Thread {
            try {
                val status = YoutubeDL.getInstance().updateYoutubeDL(
                    reactApplicationContext,
                    YoutubeDL.UpdateChannel._STABLE
                )
                promise.resolve(status?.name ?: "UNKNOWN")
            } catch (e: Exception) {
                promise.reject("YTDLP_UPDATE_ERROR", e.message ?: "Update failed", e)
            }
        }.start()
    }

    @ReactMethod
    fun getVersion(promise: Promise) {
        try {
            val version = YoutubeDL.getInstance().version(reactApplicationContext)
            promise.resolve(version ?: "unknown")
        } catch (e: Exception) {
            promise.reject("YTDLP_VERSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openFile(path: String, promise: Promise) {
        try {
            val file = File(path)
            if (!file.exists()) {
                promise.reject("OPEN_FILE_NOT_FOUND", "File not found: $path")
                return
            }
            val uri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.downloadsprovider",
                file
            )
            val mimeType = MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(file.extension.lowercase()) ?: "video/*"
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: ActivityNotFoundException) {
            promise.reject("OPEN_FILE_NO_APP", "No app found to open this file", e)
        } catch (e: Exception) {
            promise.reject("OPEN_FILE_ERROR", e.message ?: "Failed to open file", e)
        }
    }

    // Returns a file:// URI to a cached JPEG frame of the video, or null if one can't be made
    @ReactMethod
    fun getThumbnail(path: String, promise: Promise) {
        Thread {
            try {
                val file = File(path)
                if (!file.exists()) {
                    promise.resolve(null)
                    return@Thread
                }
                val thumbDir = File(reactApplicationContext.cacheDir, "thumbnails")
                if (!thumbDir.exists()) thumbDir.mkdirs()
                val key = "${file.absolutePath}|${file.lastModified()}".hashCode().toUInt().toString(16)
                val thumbFile = File(thumbDir, "$key.jpg")

                if (!thumbFile.exists()) {
                    val bitmap: Bitmap? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ThumbnailUtils.createVideoThumbnail(file, Size(320, 180), null)
                    } else {
                        @Suppress("DEPRECATION")
                        ThumbnailUtils.createVideoThumbnail(file.absolutePath, MediaStore.Images.Thumbnails.MINI_KIND)
                    }
                    if (bitmap == null) {
                        promise.resolve(null)
                        return@Thread
                    }
                    FileOutputStream(thumbFile).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }
                    bitmap.recycle()
                }
                promise.resolve("file://${thumbFile.absolutePath}")
            } catch (e: Exception) {
                // Not a video, or no decodable frame — caller falls back to a placeholder
                promise.resolve(null)
            }
        }.start()
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}

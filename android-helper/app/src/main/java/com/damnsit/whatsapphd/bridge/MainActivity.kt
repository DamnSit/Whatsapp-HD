package com.damnsit.whatsapphd.bridge

import android.Manifest
import android.app.Activity
import android.app.ActivityOptions
import android.app.PendingIntent
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.service.chooser.ChooserAction
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.util.Locale

/**
 * Receives a shared-storage path from the Termux CLI, copies the media into
 * this app's private cache, and hands a FileProvider URI to WhatsApp.
 */
class MainActivity : Activity() {
    private var pendingPath: String? = null
    private var pendingMime: String = "image/*"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showMessage("Preparing WhatsApp Status…")
        handleLaunchIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLaunchIntent(intent)
    }

    private fun handleLaunchIntent(source: Intent?) {
        val path = source?.getStringExtra(EXTRA_MEDIA_PATH)
        if (path.isNullOrBlank()) {
            showMessage("Launch from Termux with --native-status --upload PATH.")
            return
        }

        pendingPath = path
        pendingMime = mimeForPath(path)
        if (hasMediaPermission()) {
            copyPathAndShare(path)
        } else {
            requestMediaPermission()
        }
    }

    private fun hasMediaPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val permission = when {
            Build.VERSION.SDK_INT >= 33 && pendingMime.startsWith("video/") ->
                Manifest.permission.READ_MEDIA_VIDEO
            Build.VERSION.SDK_INT >= 33 ->
                Manifest.permission.READ_MEDIA_IMAGES
            else -> Manifest.permission.READ_EXTERNAL_STORAGE
        }
        if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) return true
        return Build.VERSION.SDK_INT >= 34 &&
            checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun requestMediaPermission() {
        if (Build.VERSION.SDK_INT < 23) {
            pendingPath?.let(::copyPathAndShare)
            return
        }

        val permissions = when {
            Build.VERSION.SDK_INT >= 34 -> arrayOf(
                if (pendingMime.startsWith("video/")) Manifest.permission.READ_MEDIA_VIDEO
                else Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
            )
            Build.VERSION.SDK_INT >= 33 -> arrayOf(
                if (pendingMime.startsWith("video/")) Manifest.permission.READ_MEDIA_VIDEO
                else Manifest.permission.READ_MEDIA_IMAGES
            )
            else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        requestPermissions(permissions, REQUEST_MEDIA_PERMISSION)
    }

    @Deprecated("Uses the platform permission callback for broad Android-version compatibility")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_MEDIA_PERMISSION) return

        if (hasMediaPermission()) {
            pendingPath?.let(::copyPathAndShare)
        } else {
            openDocumentPicker()
        }
    }

    private fun copyPathAndShare(rawPath: String) {
        try {
            val externalRoot = Environment.getExternalStorageDirectory().canonicalFile
            val source = File(rawPath).canonicalFile
            require(source.path.startsWith(externalRoot.path + File.separator)) {
                "Use a file under shared storage, such as /storage/emulated/0/Download."
            }
            require(source.isFile && source.length() > 0L) {
                "The media file does not exist or is empty: $rawPath"
            }

            val extension = source.extension.lowercase(Locale.ROOT)
            require(extension in SUPPORTED_EXTENSIONS) {
                "Supported: JPG, JPEG, PNG, WebP, MP4, M4V, and 3GP."
            }

            cacheDir.listFiles()
                ?.filter { it.name.startsWith("wa-status-") }
                ?.forEach { it.delete() }

            val cached = File(cacheDir, "wa-status-${System.currentTimeMillis()}.$extension")
            FileInputStream(source).use { input ->
                cached.outputStream().use { output -> input.copyTo(output) }
            }
            launchWhatsAppStatus(cached, mimeForPath(cached.name))
        } catch (error: SecurityException) {
            openDocumentPicker()
        } catch (error: Exception) {
            showError(error.message ?: "Could not prepare the media file.")
        }
    }

    private fun openDocumentPicker() {
        val picker = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (pendingMime.startsWith("video/")) "video/*" else "image/*"
        }
        try {
            startActivityForResult(picker, REQUEST_PICK_MEDIA)
        } catch (error: Exception) {
            showError("Could not read this file. Grant media access or choose it with the file picker.")
        }
    }

    @Deprecated("Uses the platform activity result callback for broad Android-version compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_PICK_MEDIA) {
            if (requestCode == REQUEST_STATUS) finish()
            return
        }
        if (resultCode != RESULT_OK || data?.data == null) {
            finish()
            return
        }

        try {
            val uri = data.data!!
            val name = queryDisplayName(uri)
            val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
            require(extension in SUPPORTED_EXTENSIONS) {
                "Unsupported media type. Choose JPG, PNG, WebP, MP4, M4V, or 3GP."
            }

            val cached = File(cacheDir, "wa-status-${System.currentTimeMillis()}.$extension")
            contentResolver.openInputStream(uri)?.use { input ->
                cached.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IllegalStateException("Could not read the selected media.")
            launchWhatsAppStatus(cached, mimeForPath(cached.name))
        } catch (error: Exception) {
            showError(error.message ?: "Could not copy selected media.")
        }
    }

    private fun queryDisplayName(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) {
                val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) return it.getString(index)
            }
        }
        return uri.lastPathSegment ?: "status.jpg"
    }

    private fun launchWhatsAppStatus(file: File, mime: String) {
        val mediaUri = FileProvider.getUriForFile(
            this,
            "${packageName}.fileprovider",
            file
        )
        val readPermission = Intent.FLAG_GRANT_READ_URI_PERMISSION

        val targetIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse(WHATSAPP_STATUS_DEEPLINK)
            setPackage(WHATSAPP_PACKAGE)
            putExtra(Intent.EXTRA_STREAM, mediaUri)
            putExtra(WHATSAPP_SHARE_TYPE_EXTRA_KEY, "SHARE_TO_STATUS")
            putExtra(SOURCE_APP_PACKAGE_NAME_EXTRA_KEY, packageName)
            clipData = ClipData.newUri(contentResolver, "WhatsApp Status media", mediaUri)
            addFlags(readPermission)
            addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        }

        try {
            if (packageManager.getPackageInfo(WHATSAPP_PACKAGE, 0) == null) {
                throw IllegalStateException("WhatsApp Messenger is not installed.")
            }
            grantUriPermission(WHATSAPP_PACKAGE, mediaUri, readPermission)

            if (Build.VERSION.SDK_INT >= 34) {
                launchShareSheet(mediaUri, mime, targetIntent)
            } else {
                startActivityForResult(targetIntent, REQUEST_STATUS)
            }
        } catch (error: Exception) {
            showError(error.message ?: "Could not open WhatsApp Status.")
        }
    }

    private fun launchShareSheet(mediaUri: Uri, mime: String, targetIntent: Intent) {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, mediaUri)
            clipData = ClipData.newUri(contentResolver, "WhatsApp Status media", mediaUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        val proxyIntent = Intent(this, StatusProxyActivity::class.java).apply {
            putExtra(EXTRA_TARGET_INTENT, targetIntent)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        }

        val options = ActivityOptions.makeBasic().apply {
            pendingIntentCreatorBackgroundActivityStartMode =
                ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
        }
        val customActionPendingIntent = PendingIntent.getActivity(
            this,
            0,
            proxyIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            options.toBundle()
        )
        val customAction = ChooserAction.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_menu_share),
            "Share to Status",
            customActionPendingIntent
        ).build()

        val chooser = Intent.createChooser(shareIntent, "Share media").apply {
            putExtra(Intent.EXTRA_CHOOSER_CUSTOM_ACTIONS, arrayOf(customAction))
        }
        startActivity(chooser)
        finish()
    }

    private fun mimeForPath(path: String): String {
        return when (path.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "3gp" -> "video/3gpp"
            "mp4", "m4v" -> "video/mp4"
            else -> "application/octet-stream"
        }
    }

    private fun showMessage(message: String) {
        setContentView(TextView(this).apply {
            text = message
            textSize = 16f
            setPadding(32, 48, 32, 48)
        })
    }

    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        showMessage(message)
    }

    companion object {
        const val EXTRA_MEDIA_PATH = "media_path"
        const val EXTRA_TARGET_INTENT = "extra_target_intent"
        private const val WHATSAPP_PACKAGE = "com.whatsapp"
        private const val WHATSAPP_STATUS_DEEPLINK = "https://wa.me/status"
        private const val WHATSAPP_SHARE_TYPE_EXTRA_KEY = "share_type"
        private const val SOURCE_APP_PACKAGE_NAME_EXTRA_KEY = "source_app_package_name"
        private const val REQUEST_MEDIA_PERMISSION = 100
        private const val REQUEST_PICK_MEDIA = 101
        private const val REQUEST_STATUS = 102
        private val SUPPORTED_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp", "mp4", "m4v", "3gp")
    }
}

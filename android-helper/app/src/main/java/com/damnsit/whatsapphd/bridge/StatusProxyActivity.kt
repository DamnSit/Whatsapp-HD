package com.damnsit.whatsapphd.bridge

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.Toast

/**
 * Runs the WhatsApp Status deep-link from a foreground Activity.
 * Android 14+ chooser custom actions use a PendingIntent; WhatsApp's
 * integration expects the target Activity to be launched for result.
 */
class StatusProxyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val targetIntent = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(MainActivity.EXTRA_TARGET_INTENT, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(MainActivity.EXTRA_TARGET_INTENT)
        }

        if (targetIntent == null) {
            finish()
            return
        }

        try {
            startActivityForResult(targetIntent, REQUEST_WHATSAPP)
        } catch (error: Exception) {
            Toast.makeText(
                this,
                error.message ?: "Unable to open WhatsApp Status.",
                Toast.LENGTH_LONG
            ).show()
            finish()
        }
    }

    @Deprecated("WhatsApp Status handoff returns through the Activity result callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_WHATSAPP) finish()
    }

    companion object {
        private const val REQUEST_WHATSAPP = 1
    }
}

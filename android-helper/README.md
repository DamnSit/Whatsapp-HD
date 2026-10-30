# Whatsapp-HD Status Bridge

A small native Android companion app used by the Termux CLI to hand media to WhatsApp's
**Share to Status** integration.

## Build

Open this directory in Android Studio and build the `app` debug variant, or run:

```sh
gradle --no-daemon :app:assembleDebug
```

The GitHub Actions workflow also builds the debug APK and publishes it as the
`whatsapp-hd-status-bridge-debug` artifact.

## Install and use

Install the debug APK, then from Termux run:

```sh
termux-setup-storage
node index.js --native-status --upload "/storage/emulated/0/Download/status.jpg"
```

The first launch requests the relevant media permission. When direct path access is unavailable,
the helper opens Android's document picker. On Android 14+, use the **Share to Status** custom
action in the system Sharesheet. On older Android versions, WhatsApp opens directly.

Review the media and current Status audience in WhatsApp, then press **Send** manually.
The helper does not modify Status Privacy or publish in the background.

See [UPSTREAM-NOTICE.md](UPSTREAM-NOTICE.md) for the integration source and license notice.

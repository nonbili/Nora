# Store screenshots

Both capture scripts frame each raw screen with a headline from
`scripts/store_caption.py`. Edit the `CAPTIONS` there and capture again to
change them; captioning an already-captioned image frames it twice.

## Google Play and README

The six Android captures in `../../metadata/en-US/images/phoneScreenshots/`
are shared by Google Play, F-Droid metadata, and the repository README. They
show the home screen, feed, media grid, sources, profiles, and tabs, in that
order. The Google Play screenshot upload lane reads this canonical metadata
directory through an English-only temporary staging tree, since the shared
F-Droid tree contains locale names Play does not accept. Other listing images
and release changelog upload paths are unchanged.

The images are opaque RGB PNGs captured at 1080×1920. The emulator display is
set to this size before launching the app, so its UI reflows naturally rather
than being stretched or cropped. This uses the recommended portrait size in
[Google Play's screenshot guidance](https://support.google.com/googleplay/android-developer/answer/9866151).

To capture again, start an isolated, read-only ARM64 AVD session and install a
debuggable APK compatible with the current Expo native dependencies:

```bash
"$ANDROID_HOME/emulator/emulator" -avd Pixel_8a -read-only -no-snapshot \
  -no-window -no-audio -port 5580
adb -s emulator-5580 install -r /path/to/Nora-debug.apk
python3 scripts/capture-android-screenshots.py --serial emulator-5580
```

The script refuses physical devices. It seeds the demo data and local media,
temporarily selects `scripts/app-preview-entry.ts` as the Metro entry, and
restores `package.json` when finished. It also stops its Metro server and
clears the display/demo overrides. Close the read-only emulator session to
discard its demo app data. The connected physical device is not modified.

## App Store

The English screenshots in `../metadata/ios/en-US/` are fresh, full-resolution
captures of the seeded preview app. They use the same demo accounts and local
media as the store videos. No personal account data is captured.

Each device family has six images, ordered by filename:

1. Social browser home
2. Feed timeline
3. Media grid
4. Manage sources
5. Profiles and sessions
6. Tabs on iPhone; a two-column feed deck on iPad

The iPhone set is 1242×2688; the iPad set is 2048×2732. Images are opaque RGB PNGs
at native capture resolution, using accepted sizes in
[Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
Fastlane recognizes the device families from these dimensions.

## Refreshing

Install the dedicated `NoraPreview.app` build, with the preview entry and embedded
JavaScript bundle described in `../videos/README.md`, on the `Nora Preview iPhone`
and `Nora Preview iPad` simulators. The capture script verifies that this seeded
build is installed; its entry resets demo app data on every launch.

With Xcode, Maestro, and `scripts/requirements-promo-video.txt` installed:

```bash
python3 scripts/capture-store-screenshots.py
python3 scripts/capture-store-screenshots.py --target iphone
python3 scripts/capture-store-screenshots.py --target ipad
```

Override the dedicated simulator IDs with `--iphone-device` or `--ipad-device`.
The script seeds local media, waits for each screen to settle, captures six images
per target, and validates their dimensions before replacing the set. It restores
the previous preview-state file and booted device set when finished. Only one
iOS simulator is booted during capture so Maestro uses the correct device driver.

Open `index.html` to review both sets. The existing `ios upload_screenshots` lane
now reads this asset directory. Uploading remains a separate command:

```bash
bundle exec fastlane android upload_screenshots
bundle exec fastlane ios upload_screenshots
```

# Promotional & App Store Preview Videos

## Outputs

- **Google Play** (`fastlane/videos/android/en-US/`): 20s, 30 fps, H.264 High (`yuv420p`) + stereo AAC (`44.1 kHz`), rendered from UI captures in `fastlane/videos/assets/*.png`.
  - `promo-landscape-1920x1080.mp4` (`1920×1080`, 16:9 — also suitable for the YouTube promo URL field on Google Play)
  - `promo-portrait-1080x1920.mp4` (`1080×1920`, 9:16 — Shorts / vertical social)
- **Apple App Store** (`fastlane/videos/ios/en-US/`): 15–30s, 30 fps, H.264 High Level 4.0 + stereo AAC (`256 kbps`, `44.1 kHz`), assembled from real iOS Simulator screen recordings in `fastlane/videos/recordings/` per App Store Review Guideline 2.3.4.
  - `app-preview-iphone-65-886x1920.mp4` (`886×1920` — 6.5" / 6.7" iPhone display family)
  - `app-preview-iphone-55-1080x1920.mp4` (`1080×1920` — 5.5" iPhone display family)
  - `app-preview-ipad-1200x1600.mp4` (`1200×1600` — 12.9" / 13" iPad Pro display family)

## Dependencies

- Python 3.9+ with `pip install -r scripts/requirements-promo-video.txt`
- `ffmpeg` (`libx264`, `aac`) and `ffprobe` on `PATH` (or set `FFMPEG` / `FFPROBE`)
- For re-recording iOS App Store captures: Xcode (`xcrun simctl`), [Maestro](https://maestro.mobile.dev), and a simulator build of `Nora.app` embedded from `scripts/app-preview-entry.ts` with `EXPO_PUBLIC_APP_PREVIEW=1`

## Generating Videos

```bash
# Google Play motion-graphics promo videos
python3 scripts/generate-promo-video.py
python3 scripts/generate-promo-video.py --target landscape --preview-dir /tmp/promo-frames
```

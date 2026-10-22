# Promotional videos

The Google Play promos are 20 seconds at 30 fps, with H.264 High (`yuv420p`)
and a silent stereo AAC track at 44.1 kHz:

- `android/en-US/promo-landscape-1920x1080.mp4`: 16:9, for the Google Play / YouTube promo.
- `android/en-US/promo-portrait-1080x1920.mp4`: 9:16, for vertical social posts.

The edit uses real interactions recorded in the seeded iOS Simulator preview app,
with demo accounts and locally generated media from `assets/native-preview-fixture.json`.
The app views are cropped for readability, with no stretched UI or simulated scrolling.
These are promotional compositions; this script does not produce App Store previews.

| Time | Story |
| --- | --- |
| 0–3s | Your socials. One browser. |
| 3–9s | Open the feed and scroll through posts. |
| 9–14s | Switch between Work and Personal profiles. |
| 14–17s | Switch from the timeline to the media grid. |
| 17–20s | Nora logo and “Try Nora today” closing card. |

Shots overlap in 0.35-second dissolves, keeping content visible at every boundary.

## Rendering

Python 3.9+, `pip install -r scripts/requirements-promo-video.txt`, and `ffmpeg`
on `PATH` are required. Set `FFMPEG` to override its executable.

The four source clips in `recordings/promo/` are committed, so a simulator is
not needed to regenerate either format:

```bash
python3 scripts/generate-promo-video.py
python3 scripts/generate-promo-video.py --target portrait
python3 scripts/generate-promo-video.py --preview-dir /tmp/nora-promo-frames
```

Preview mode exports each shot, dissolve midpoints, and the final frame.
The renderer streams decoded frames and replaces each output only after encoding succeeds.

## Recording new app interactions

Use a dedicated iOS Simulator with a preview build whose entry is
`scripts/app-preview-entry.ts`, built with `EXPO_PUBLIC_APP_PREVIEW=1`.
The preview entry resets app data to the demo fixture on launch.
Install Xcode and Maestro, boot that simulator, then seed its local media:

```bash
python3 scripts/seed-app-preview-cache.py --udid "$PROMO_SIMULATOR_UDID"
```

In that app's data container, set `Documents/preview-state.json` to the following
starting state (back up any existing override first):

```json
{"theme":"dark","activeTabId":"tab-home"}
```

Record the interactions into a scratch directory. Use an absolute output path:

```bash
mkdir -p /tmp/nora-promo-captures
xcrun simctl status_bar "$PROMO_SIMULATOR_UDID" override --time '9:41' \
  --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
maestro --udid "$PROMO_SIMULATOR_UDID" test \
  -e OUTPUT_DIR=/tmp/nora-promo-captures fastlane/videos/capture-promo.yaml
python3 scripts/generate-promo-video.py --import-recordings /tmp/nora-promo-captures
```

Import requires `ffprobe` (or `FFPROBE`). It removes frozen lead-in before the
first action, keeps 0.4 seconds of context, fits each clip to its shot, and holds
the final frame when needed. Inspect the captures and both exports after importing:
automation timing and image loading can vary between machines. Restore the previous
preview override and clear the simulator status-bar override after recording.

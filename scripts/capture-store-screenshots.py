#!/usr/bin/env python3
"""Capture captioned English App Store screenshots from the dedicated Nora preview simulators.

Requires Xcode, Maestro, Pillow, and a seeded NoraPreview.app installation.
The preview entry clears demo app data on launch. Never run on a personal app install.
"""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from PIL import Image, ImageChops, ImageStat

from store_caption import CAPTIONS, caption

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'fastlane' / 'metadata' / 'ios' / 'en-US'
BUNDLE = 'jp.nonbili.nora'
TARGETS = {
    'iphone': ('Nora Preview iPhone', (1242, 2688)),
    'ipad': ('Nora Preview iPad', (2048, 2732)),
}
SCREENS = [
    ('01-home', {'activeTabId': 'tab-home'}),
    ('02-timeline', {'activeTabId': 'tab-feed-all'}),
    ('03-gallery', {'activeTabId': 'tab-feed-all', 'feedMediaOnly': True}),
    ('04-sources', {'activeTabId': 'tab-feed-all', 'sourcesScreen': True}),
    ('05-profiles', {'activeTabId': 'tab-home', 'settingsModalOpen': True}),
]


def simctl(*args, **kwargs):
    result = subprocess.run(['xcrun', 'simctl', *args], capture_output=True, **kwargs)
    if result.returncode:
        details = result.stderr if isinstance(result.stderr, str) else result.stderr.decode(errors='replace')
        raise RuntimeError(f"simctl {' '.join(args)} failed:\n{details}")
    return result


def launch(device):
    # A freshly booted simulator may briefly reject process launch requests.
    deadline = time.monotonic()+45
    while True:
        try:
            simctl('launch', device, BUNDLE)
            return
        except RuntimeError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)


def devices():
    return [device for group in json.loads(simctl('list', 'devices', 'available', '-j').stdout)['devices'].values()
            for device in group]


def snapshot(device):
    # The Simulator service cannot write directly to some external workspaces.
    with tempfile.TemporaryDirectory(prefix='nora-snapshot-', dir='/tmp') as work:
        path = Path(work)/'screen.png'
        simctl('io', device, 'screenshot', '--type=png', str(path))
        with Image.open(path) as image:
            return image.convert('RGB')


def settled_snapshot(device):
    started = time.monotonic()
    previous, stable = None, 0
    while time.monotonic()-started < 20:
        image = snapshot(device)
        thumb = image.resize((100, 160))
        if previous is not None:
            difference = sum(ImageStat.Stat(ImageChops.difference(thumb, previous)).mean)/3
            stable = stable+1 if difference < .15 else 0
            if stable >= 2 and time.monotonic()-started >= 3:
                return image
        previous = thumb
        time.sleep(.6)
    raise RuntimeError('Screen did not settle; inspect the simulator before capturing.')


def capture(target, device):
    name, size = TARGETS[target]
    bundle = Path(simctl('get_app_container', device, BUNDLE, 'app', text=True).stdout.strip())
    # The dedicated seeded build must be installed; its entry resets MMKV data.
    if bundle.name != 'NoraPreview.app' or b'preview-state.json' not in (bundle/'main.jsbundle').read_bytes():
        raise RuntimeError(f'{name} must have the dedicated NoraPreview.app build installed.')
    container = Path(simctl('get_app_container', device, BUNDLE, 'data', text=True).stdout.strip())
    override = container/'Documents'/'preview-state.json'
    previous = override.read_bytes() if override.exists() else None
    OUTPUT.mkdir(parents=True, exist_ok=True)
    screens = [*SCREENS, ('06-tabs', {'activeTabId': 'tab-home', 'tabModalOpen': True})]
    if target == 'ipad':
        screens[-1] = ('06-deck', {'activeTabId': 'tab-feed-all', 'desktopLayout': 'on',
                                   'activeGroupId': 'group-deck'})
    try:
        subprocess.run([sys.executable, str(ROOT/'scripts'/'seed-app-preview-cache.py'),
                        '--udid', device], check=True)
        simctl('status_bar', device, 'override', '--time', '9:41', '--dataNetwork', 'wifi',
               '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
        with tempfile.TemporaryDirectory(prefix='.screenshots-', dir=OUTPUT) as staging:
            staging = Path(staging)
            for label, state in screens:
                override.write_text(json.dumps({'theme': 'dark', 'desktopLayout': 'off', **state}))
                subprocess.run(['xcrun', 'simctl', 'terminate', device, BUNDLE], capture_output=True)
                launch(device)
                image = settled_snapshot(device)
                if label == '05-profiles':
                    flow = staging/'profiles.yaml'
                    flow.write_text('appId: jp.nonbili.nora\n---\n'
                                    "- tapOn: '(?s).*Profiles & Sessions.*'\n"
                                    "- assertVisible: '(?s).*Default.*'\n"
                                    '- waitForAnimationToEnd\n')
                    subprocess.run(['maestro', 'test', '--udid', device, '--no-reinstall-driver',
                                    '--debug-output', str(staging/'debug'), str(flow)], check=True)
                    image = settled_snapshot(device)
                if image.size != size:
                    raise RuntimeError(f'{target}: expected {size}, captured {image.size}')
                image = caption(image, CAPTIONS[label.split('-', 1)[1]])
                image.save(staging/f'{target}-{label}.png', optimize=True)
                print(f'Captured {target}-{label}: {size[0]}×{size[1]} RGB', flush=True)
            for path in staging.glob('*.png'):
                path.replace(OUTPUT/path.name)
    finally:
        if previous is None:
            override.unlink(missing_ok=True)
        else:
            override.write_bytes(previous)
        subprocess.run(['xcrun', 'simctl', 'status_bar', device, 'clear'], capture_output=True)
        subprocess.run(['xcrun', 'simctl', 'terminate', device, BUNDLE], capture_output=True)
        subprocess.run(['xcrun', 'simctl', 'launch', device, BUNDLE], capture_output=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', action='append', choices=TARGETS)
    parser.add_argument('--iphone-device', help='Override the dedicated iPhone simulator UDID.')
    parser.add_argument('--ipad-device', help='Override the dedicated iPad simulator UDID.')
    args = parser.parse_args()
    known = devices()
    originally_booted = {d['udid'] for d in known if d['state'] == 'Booted'}
    try:
        for target in dict.fromkeys(args.target or TARGETS):
            name, _ = TARGETS[target]
            device = getattr(args, f'{target}_device') or next((d['udid'] for d in known if d['name'] == name), None)
            if not device:
                parser.error(f'Create the dedicated {name} simulator and install the preview build.')
            # Maestro can reuse the wrong driver when several iOS devices are booted.
            for other in devices():
                if other['state'] == 'Booted' and other['udid'] != device:
                    simctl('shutdown', other['udid'])
            if next(d for d in devices() if d['udid'] == device)['state'] != 'Booted':
                simctl('boot', device)
                simctl('bootstatus', device, '-b')
            capture(target, device)
    finally:
        for device in devices():
            if device['state'] == 'Booted' and device['udid'] not in originally_booted:
                simctl('shutdown', device['udid'])
            elif device['state'] != 'Booted' and device['udid'] in originally_booted:
                simctl('boot', device['udid'])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

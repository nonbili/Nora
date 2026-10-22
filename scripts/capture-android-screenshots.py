#!/usr/bin/env python3
"""Capture six Google Play / README screenshots in an isolated Android emulator.

Install a compatible debuggable Nora APK first. Use a read-only AVD session;
this script replaces demo data in the emulator, and refuses physical devices.
"""

import argparse
from io import BytesIO
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT/'metadata'/'en-US'/'images'/'phoneScreenshots'
PACKAGE = 'jp.nonbili.nora'
SCREENS = [
    ('home', {'activeTabId': 'tab-home'}, 'Bluesky'),
    ('timeline', {'activeTabId': 'tab-feed-all'}, 'Lena Vance'),
    ('gallery', {'activeTabId': 'tab-feed-all', 'feedMediaOnly': True}, 'Show all posts'),
    ('sources', {'activeTabId': 'tab-feed-all', 'sourcesScreen': True}, 'Manage sources'),
    ('profiles', {'activeTabId': 'tab-home', 'settingsModalOpen': True}, 'Profiles & Sessions'),
    ('tabs', {'activeTabId': 'tab-home', 'tabModalOpen': True}, 'Close all'),
]


class Capture:
    def __init__(self, serial):
        self.serial = serial

    def adb(self, *args, **kwargs):
        check = kwargs.pop('check', True)
        return subprocess.run(['adb', '-s', self.serial, *args], capture_output=True,
                              check=check, **kwargs)

    def shell(self, *args, **kwargs):
        return self.adb('shell', shlex.join(args), **kwargs)

    def write(self, path, data):
        self.shell('run-as', PACKAGE, 'sh', '-c', f'cat > {shlex.quote(path)}', input=data)

    def labels(self):
        self.shell('uiautomator', 'dump', '/sdcard/nora-screenshot-ui.xml')
        data = self.adb('exec-out', 'cat', '/sdcard/nora-screenshot-ui.xml').stdout
        return [(n.attrib.get('text', '')+' '+n.attrib.get('content-desc', ''), n.attrib.get('bounds', ''))
                for n in ET.fromstring(data).iter('node')]

    def wait_for(self, label, timeout=180):
        deadline = time.monotonic()+timeout
        while time.monotonic() < deadline:
            for text, bounds in self.labels():
                if label.lower() in text.lower():
                    values = list(map(int, re.findall(r'\d+', bounds)))
                    if len(values) == 4 and values[2] > values[0] and values[3] > values[1]:
                        return values
            time.sleep(1)
        raise RuntimeError(f'Android preview did not show {label!r}. Check the emulator and Metro log.')

    def screenshot(self):
        data = self.adb('exec-out', 'screencap', '-p').stdout
        return Image.open(BytesIO(data)).convert('RGB')

    def settled(self):
        started, previous, stable = time.monotonic(), None, 0
        while time.monotonic()-started < 20:
            image = self.screenshot()
            thumb = image.resize((90, 160))
            if previous is not None:
                difference = sum(ImageStat.Stat(ImageChops.difference(thumb, previous)).mean)/3
                stable = stable+1 if difference < .15 else 0
                if stable >= 2 and time.monotonic()-started >= 3:
                    return image
            previous = thumb
            time.sleep(.7)
        raise RuntimeError('Android screenshot did not settle.')

    def demo(self, command, *extras):
        self.shell('am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', command, *extras)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', default='emulator-5580')
    parser.add_argument('--metro-port', type=int, default=8093)
    args = parser.parse_args()
    device = Capture(args.serial)
    if not args.serial.startswith('emulator-') or device.shell('getprop', 'ro.kernel.qemu').stdout.strip() != b'1':
        parser.error('Use an isolated, read-only Android emulator; physical devices are not supported.')
    device.shell('run-as', PACKAGE, 'pwd')
    package_path = ROOT/'package.json'
    original = package_path.read_bytes()
    package = json.loads(original)
    package['main'] = './scripts/app-preview-entry.ts'
    preview_package = (json.dumps(package, indent=2)+'\n').encode()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    metro = None
    port = str(args.metro_port)
    with tempfile.TemporaryDirectory(prefix='.android-capture-', dir=OUTPUT.parent) as work:
        work = Path(work)
        log_path = work/'metro.log'
        try:
            package_path.write_bytes(preview_package)
            device.shell('am', 'force-stop', PACKAGE)
            device.shell('wm', 'size', '1080x1920')
            device.shell('settings', 'put', 'system', 'screen_off_timeout', '600000')
            device.shell('input', 'keyevent', 'KEYCODE_WAKEUP')
            device.shell('wm', 'dismiss-keyguard')
            device.shell('pm', 'grant', PACKAGE, 'android.permission.POST_NOTIFICATIONS')
            device.shell('run-as', PACKAGE, 'mkdir', '-p', 'files/watch-media', 'files/blocklist', 'shared_prefs')
            subprocess.run([sys.executable, str(ROOT/'scripts'/'seed-app-preview-cache.py'),
                            '--output-dir', str(work/'watch-media')], check=True)
            for folder in ('watch-media', 'blocklist'):
                remote = f'/data/local/tmp/nora-{work.name}-{folder}'
                device.adb('push', str(work/folder), remote)
                device.shell('run-as', PACKAGE, 'sh', '-c', f'cp {remote}/* files/{folder}/')
            preferences = (f'<?xml version="1.0" encoding="utf-8"?><map>'
                           f'<string name="debug_http_host">127.0.0.1:{port}</string>'
                           '<boolean name="js_dev_mode_debug" value="false"/>'
                           '<boolean name="js_minify_debug" value="true"/></map>')
            device.write(f'shared_prefs/{PACKAGE}_preferences.xml', preferences.encode())
            device.adb('reverse', f'tcp:{port}', f'tcp:{port}')
            device.shell('settings', 'put', 'global', 'sysui_demo_allowed', '1')
            device.demo('enter')
            device.demo('clock', '-e', 'hhmm', '0941')
            device.demo('battery', '-e', 'level', '100', '-e', 'plugged', 'false')
            device.demo('notifications', '-e', 'visible', 'false')
            device.demo('network', '-e', 'wifi', 'show', '-e', 'level', '4', '-e', 'mobile', 'hide')
            environment = {**os.environ, 'EXPO_PUBLIC_APP_PREVIEW': '1', 'EXPO_NO_DOTENV': '1',
                           'EXPO_OFFLINE': '1', 'CI': '1',
                           'NODE_OPTIONS': (os.environ.get('NODE_OPTIONS', '')+' --dns-result-order=ipv4first').strip()}
            with log_path.open('wb') as log:
                metro = subprocess.Popen(['node', str(ROOT/'node_modules'/'expo'/'bin'/'cli'),
                                          'start', '--localhost', '--port', port, '--no-dev', '--minify'],
                                         cwd=ROOT, env=environment, stdout=log, stderr=log, start_new_session=True)
            for _ in range(180):
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/status', timeout=2) as response:
                        if b'packager-status:running' in response.read():
                            break
                except OSError:
                    pass
                if metro.poll() is not None:
                    raise RuntimeError('Metro exited before starting.')
                time.sleep(1)
            else:
                raise RuntimeError('Metro did not become ready.')
            print('Android preview Metro ready; loading the demo app...', flush=True)
            for index, (name, state, label) in enumerate(SCREENS, 1):
                device.shell('am', 'force-stop', PACKAGE)
                device.write('files/preview-state.json', json.dumps({'theme': 'dark', 'desktopLayout': 'off', **state}).encode())
                device.shell('am', 'start', '-W', '-n', f'{PACKAGE}/.MainActivity')
                bounds = device.wait_for(label)
                if name == 'profiles':
                    device.shell('input', 'tap', str((bounds[0]+bounds[2])//2), str((bounds[1]+bounds[3])//2))
                    device.wait_for('Default')
                image = device.settled()
                if image.size != (1080, 1920):
                    raise RuntimeError(f'Unexpected Android screenshot dimensions: {image.size}')
                image.save(work/f'{index}.png', optimize=True)
                print(f'Captured Android {index}/6: {name}', flush=True)
            for path in sorted(work.glob('*.png')):
                path.replace(OUTPUT/path.name)
            for old in OUTPUT.glob('*.jpg'):
                old.unlink()
        except Exception:
            if log_path.exists():
                print(log_path.read_text(errors='replace')[-5000:], file=sys.stderr)
            raise
        finally:
            if metro is not None and metro.poll() is None:
                os.killpg(metro.pid, signal.SIGTERM)
                try:
                    metro.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(metro.pid, signal.SIGKILL)
                    metro.wait()
            if package_path.read_bytes() == preview_package:
                package_path.write_bytes(original)
            else:
                current = json.loads(package_path.read_bytes())
                if current.get('main') == package['main']:
                    current['main'] = json.loads(original)['main']
                    package_path.write_text(json.dumps(current, indent=2)+'\n')
            device.shell('am', 'force-stop', PACKAGE, check=False)
            device.adb('reverse', '--remove', f'tcp:{port}', check=False)
            device.shell('am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', 'exit', check=False)
            device.shell('wm', 'size', 'reset', check=False)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

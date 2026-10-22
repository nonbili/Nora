#!/usr/bin/env python3
"""Render 20-second App Store previews from full-screen native recordings."""

import argparse
from contextlib import ExitStack
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / 'fastlane' / 'videos'
SPEC = importlib.util.spec_from_file_location('promo', Path(__file__).with_name('generate-promo-video.py'))
promo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(promo)
FPS, DURATION, DISSOLVE = 30, 20, .25
SHOTS = [
    ('home', 0, 3, 'Your socials. One browser.'),
    ('timeline', 3, 9, 'Your sources.\nYour timelines.'),
    ('profiles', 9, 14, 'Keep work and personal\nseparate.'),
    ('gallery', 14, 20, 'Browse photos and videos\nin a media grid.'),
]
TARGETS = {
    'iphone': (886, 1920, VIDEOS / 'recordings' / 'promo'),
    'ipad': (1200, 1600, VIDEOS / 'recordings' / 'app-store-ipad'),
}


def probe(path):
    return json.loads(subprocess.check_output(
        [os.environ.get('FFPROBE', 'ffprobe'), '-v', 'error', '-show_streams',
         '-show_format', '-of', 'json', str(path)], text=True))


def caption(width, height, text):
    image = Image.new('RGBA', (width, height))
    draw = ImageDraw.Draw(image)
    margin = int(width*.045)
    font = promo.fit_font(draw, text, int(width*.049), width-margin*4, True)
    box = draw.multiline_textbbox((0, 0), text, font=font, spacing=10)
    text_h = box[3]-box[1]
    box_h = text_h + int(width*.05)
    top = int(height*.91) - box_h
    draw.rounded_rectangle((margin, top, width-margin, top+box_h),
                           radius=int(width*.025), fill=(8, 10, 17, 228))
    promo.text_block(draw, (width//2, top+(box_h-text_h)//2), text, font,
                     'white', spacing=10, anchor='ma')
    return image


def validate(path, width, height):
    info = probe(path)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    checks = [video['codec_name'] == 'h264', video['profile'] == 'High',
              video['level'] == 40, video['pix_fmt'] == 'yuv420p',
              (video['width'], video['height']) == (width, height),
              video['avg_frame_rate'] == '30/1', int(video['nb_frames']) == FPS*DURATION,
              abs(float(info['format']['duration'])-DURATION) < .05,
              10_000_000 <= int(video['bit_rate']) <= 12_000_000,
              int(info['format']['size']) < 500_000_000,
              audio['codec_name'] == 'aac', audio['channels'] == 2,
              int(audio['sample_rate']) == 44100]
    if not all(checks):
        raise RuntimeError(f'App preview failed export validation: {path}\n{info}')
    subprocess.run([os.environ.get('FFMPEG', 'ffmpeg'), '-v', 'error', '-xerror',
                    '-i', str(path), '-f', 'null', '-'], check=True)


def render(target, width, height, directory):
    ffmpeg = os.environ.get('FFMPEG', 'ffmpeg')
    output_dir = VIDEOS / 'ios' / 'en-US'
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f'app-preview-{target}-{width}x{height}.mp4'
    for clip, *_ in SHOTS:
        source = directory / f'{clip}.mp4'
        video = next(s for s in probe(source)['streams'] if s['codec_type'] == 'video')
        if abs((video['width']/video['height'])/(width/height)-1) > .015:
            raise ValueError(f'{source} is not {target} footage; capture the correct device layout.')
    with tempfile.TemporaryDirectory(prefix='.app-preview-', dir=output_dir) as work, ExitStack() as stack:
        staged = Path(work) / output.name
        streams = [stack.enter_context(promo.VideoFrames(directory/f'{clip}.mp4',
                    width, height, full_screen=True)) for clip, *_ in SHOTS]
        captions = [caption(width, height, text) for _, _, _, text in SHOTS]
        command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                   '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{width}x{height}',
                   '-r', str(FPS), '-i', '-', '-f', 'lavfi', '-i',
                   'anullsrc=channel_layout=stereo:sample_rate=44100',
                   '-c:v', 'libx264', '-threads', '2', '-preset', 'medium',
                   '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
                   '-b:v', '11M', '-minrate', '11M', '-maxrate', '11M', '-bufsize', '22M',
                   '-x264-params', 'nal-hrd=cbr:force-cfr=1',
                   '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
                   '-c:a', 'aac', '-b:a', '256k', '-ar', '44100', '-ac', '2',
                   '-shortest', '-movflags', '+faststart']

        def shot(index, t):
            _, start, end, _ = SHOTS[index]
            image = streams[index].at(t-start).copy()
            alpha = promo.smoothstep(.35, .55, t-start) * (1-promo.smoothstep(end-.25, end-.05, t))
            if alpha > 0:
                layer = captions[index].copy()
                layer.putalpha(layer.getchannel('A').point(lambda a: round(a*alpha)))
                image.alpha_composite(layer)
            return image

        with promo.video_encoder(command, staged) as pipe:
            for n in range(FPS*DURATION):
                t = n/FPS
                index = next(i for i, (_, _, end, _) in enumerate(SHOTS) if t < end)
                image = shot(index, t)
                elapsed = t-SHOTS[index][1]
                if index and elapsed < DISSOLVE:
                    image = Image.blend(shot(index-1, t), image,
                                        promo.smoothstep(0, DISSOLVE, elapsed))
                pipe.write(image.tobytes())
                if (n+1) % 120 == 0:
                    print(f'[{target}] {n+1}/600 frames', flush=True)
        validate(staged, width, height)
        poster = Path(work) / f'{output.stem}-poster.jpg'
        subprocess.run([ffmpeg, '-v', 'error', '-ss', '16', '-i', str(staged),
                        '-frames:v', '1', '-q:v', '2', str(poster)], check=True)
        staged.replace(output)
        poster.replace(output.with_name(poster.name))
    print(f'Validated {output.relative_to(ROOT)}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', action='append', choices=TARGETS,
                        help='Repeat to select targets; default: iPhone and iPad.')
    parser.add_argument('--import-recordings', type=Path, metavar='DIR',
                        help='Normalize raw captures for exactly one selected target.')
    args = parser.parse_args()
    for executable in ('FFMPEG', 'FFPROBE'):
        if shutil.which(os.environ.get(executable, executable.lower())) is None:
            parser.error(f'Install {executable.lower()} or set {executable}.')
    selected = list(dict.fromkeys(args.target or TARGETS))
    if args.import_recordings:
        if len(selected) != 1:
            parser.error('--import-recordings requires exactly one --target.')
        width, _, directory = TARGETS[selected[0]]
        promo.import_recordings(args.import_recordings, directory, width)
    for target in selected:
        render(target, *TARGETS[target])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

"""Frame raw store screenshots with a headline above a scaled-down capture.

Used by the capture scripts after a screen settles. Only apply to raw captures:
captioning an already-captioned image frames it twice.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CAPTIONS = {
    'home': 'Every social network in one app',
    'timeline': 'Your own timeline, no algorithm',
    'gallery': 'Photos and videos at a glance',
    'sources': 'Follow accounts, often without logging in',
    'profiles': 'Many accounts, each with its own login',
    'tabs': 'Keep every page open in tabs',
    'deck': 'Several timelines side by side',
}
TOP, BOTTOM = (24, 26, 44), (52, 56, 128)
FONTS = [
    ('/System/Library/Fonts/SFNS.ttf', 0, 'Bold'),
    ('/System/Library/Fonts/HelveticaNeue.ttc', 1, None),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 0, None),
]


def font(size):
    for path, index, variation in FONTS:
        if Path(path).exists():
            loaded = ImageFont.truetype(path, size, index=index)
            if variation:
                loaded.set_variation_by_name(variation)
            return loaded
    raise RuntimeError('No bold system font found for screenshot captions.')


def wrap(draw, text, face, width):
    lines = []
    for word in text.split():
        candidate = f'{lines[-1]} {word}' if lines else word
        if lines and draw.textlength(candidate, font=face) <= width:
            lines[-1] = candidate
        else:
            lines.append(word)
    return lines


def caption(screen, text):
    width, height = screen.size
    canvas = Image.new('RGB', screen.size)
    gradient = Image.linear_gradient('L').resize(screen.size)
    canvas.paste(Image.composite(Image.new('RGB', screen.size, BOTTOM), Image.new('RGB', screen.size, TOP), gradient))
    draw = ImageDraw.Draw(canvas)
    margin = round(width*.07)
    face = font(round(width*(.072 if width/height < .6 else .05)))
    lines = wrap(draw, text, face, width-2*margin)
    line_height = round(face.size*1.18)
    header = round(height*.05)+line_height*len(lines)+round(height*.035)
    for index, line in enumerate(lines):
        draw.text((width/2, round(height*.05)+index*line_height), line, font=face, fill='white', anchor='ma')
    scale = min((height-header-round(height*.035))/height, (width-2*margin)/width)
    shot = screen.resize((round(width*scale), round(height*scale)), Image.LANCZOS)
    mask = Image.new('L', shot.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *shot.size), radius=round(shot.width*.05), fill=255)
    canvas.paste(shot, ((width-shot.width)//2, header), mask)
    return canvas

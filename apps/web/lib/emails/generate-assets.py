"""
Draws the images used in Railor's sign-in email and writes them to
sign-in-assets.json as base64, so the email can attach them inline (no remote
images, no tracking pixel). Everything is drawn here from shapes: nothing is
traced from another site or brand.

    python apps/web/lib/emails/generate-assets.py

Needs Pillow. The animated hero is a GIF because mail clients ignore CSS and
JavaScript motion; Outlook for Windows shows only its first frame, so frame 0 is
a complete picture.
"""
import base64
import io
import json
import math
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sign-in-assets.json")

INK = (28, 27, 25)
ORANGE = (200, 68, 32)
ORANGE_SOFT = (255, 173, 140)
CREAM = (255, 244, 230)

SS = 2                      # supersampling for the hero
W, H = 760, 320             # hero size in pixels (shown at 560 wide)
FRAMES = 22
FRAME_MS = 80


def font(size, bold=True):
    names = ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
    folders = [r"C:\Windows\Fonts", "/usr/share/fonts/truetype/dejavu", "/Library/Fonts", "/System/Library/Fonts/Supplemental"]
    for folder in folders:
        for name in names:
            path = os.path.join(folder, name)
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def bezier(p0, p1, p2, t):
    x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
    y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
    return x, y


def background():
    """A warm dark gradient with a soft glow where the route peaks."""
    w, h = W * SS, H * SS
    base = Image.new("RGB", (w, h), INK)
    draw = ImageDraw.Draw(base)
    top, bottom = (40, 28, 25), (66, 26, 18)
    for y in range(h):
        draw.line([(0, y), (w, y)], fill=lerp(top, bottom, y / h))
    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse([w * 0.18, h * -0.35, w * 0.82, h * 0.75], fill=95)
    glow = glow.filter(ImageFilter.GaussianBlur(90 * SS / 2))
    warm = Image.new("RGB", (w, h), (214, 84, 40))
    base = Image.composite(warm, base, glow.point(lambda v: int(v * 0.55)))
    return base.convert("RGBA")


def dots_layer():
    """Faint fixed dots, like a map at night."""
    layer = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    rng = random.Random(7)
    for _ in range(90):
        x, y = rng.randrange(0, W * SS), rng.randrange(0, H * SS)
        r = rng.choice([1.2, 1.6, 2.2]) * SS / 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(255, 235, 215, rng.choice([28, 40, 56])))
    return layer


def coin(layer, cx, cy, r, symbol, label, pulse=0.0):
    """A cream coin with a soft shadow and a ring; `pulse` (0..1) sends a ring outward."""
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([cx - r, cy - r + 14 * SS, cx + r, cy + r + 14 * SS], fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14 * SS))
    layer.alpha_composite(shadow)
    draw = ImageDraw.Draw(layer)
    if pulse > 0:
        grow = r + pulse * 34 * SS
        draw.ellipse([cx - grow, cy - grow, cx + grow, cy + grow], outline=ORANGE_SOFT + (int(170 * (1 - pulse)),), width=4 * SS)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE + (255,))
    inner = r - 7 * SS
    for i in range(int(inner)):          # a little lift: lighter toward the top
        t = i / max(inner, 1)
        draw.ellipse([cx - inner + i * 0.15, cy - inner + i * 0.55, cx + inner - i * 0.15, cy + inner - i * 0.15], outline=None)
    draw.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=CREAM + (255,))
    f = font(58 * SS)
    box = draw.textbbox((0, 0), symbol, font=f)
    draw.text((cx - (box[0] + box[2]) / 2, cy - (box[1] + box[3]) / 2 - 3 * SS), symbol, font=f, fill=INK + (255,))
    lf = font(17 * SS)
    lb = draw.textbbox((0, 0), label, font=lf)
    draw.text((cx - (lb[0] + lb[2]) / 2, cy + r + 20 * SS), label, font=lf, fill=(255, 226, 205, 235))


def draw_frame(index, bg, dots):
    t = index / FRAMES
    img = bg.copy()
    img.alpha_composite(dots)
    s = SS
    left, right = (190 * s, 190 * s), (570 * s, 190 * s)
    p0, p1, p2 = (left[0], left[1] - 58 * s), (380 * s, -70 * s), (right[0], right[1] - 58 * s)

    # Small coins drifting in the background.
    drift = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(drift)
    for (x, y, sym, phase, size) in [(70, 78, "£", 0.0, 24), (690, 80, "¥", 0.35, 22), (95, 262, "₹", 0.6, 20), (668, 258, "A$", 0.15, 20)]:
        bob = math.sin((t + phase) * 2 * math.pi) * 7 * s
        cx, cy, r = x * s, y * s + bob, size * s
        dd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 226, 205, 90), width=2 * s)
        f = font(int(size * 0.95) * s)
        box = dd.textbbox((0, 0), sym, font=f)
        dd.text((cx - (box[0] + box[2]) / 2, cy - (box[1] + box[3]) / 2 - s), sym, font=f, fill=(255, 226, 205, 120))
    img.alpha_composite(drift)

    # The route: dots marching from the first coin to the second.
    route = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(route)
    samples = [bezier(p0, p1, p2, k / 400) for k in range(401)]
    lengths = [0.0]
    for a, b in zip(samples, samples[1:]):
        lengths.append(lengths[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = lengths[-1]
    spacing = 26 * s
    offset = (t * spacing) % spacing
    d = offset
    while d < total:
        k = next(i for i, length in enumerate(lengths) if length >= d)
        x, y = samples[k]
        edge = min(d, total - d) / (60 * s)
        alpha = int(185 * min(1, edge))
        rd.ellipse([x - 3.2 * s, y - 3.2 * s, x + 3.2 * s, y + 3.2 * s], fill=ORANGE_SOFT + (alpha,))
        d += spacing
    img.alpha_composite(route)

    # The price travelling along it, with a glow and a short trail.
    head = (t + 0.4) % 1.0           # frame 0 already shows the price on its way
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for step in range(9, -1, -1):
        tt = head - step * 0.018
        if tt < 0:
            continue
        x, y = bezier(p0, p1, p2, tt)
        r = (7 - step * 0.45) * s
        gd.ellipse([x - r, y - r, x + r, y + r], fill=(255, 205, 170, int(255 * (1 - step / 10))))
    blurred = glow.filter(ImageFilter.GaussianBlur(9 * s))
    img.alpha_composite(blurred)
    img.alpha_composite(glow)

    # Coins, with a ring leaving the first as the price departs and landing on the second.
    send = max(0.0, 1 - head / 0.18) if head < 0.18 else 0.0
    arrive = (head - 0.82) / 0.18 if head > 0.82 else 0.0
    coin(img, left[0], left[1], 64 * s, "$", "USD", pulse=1 - send if send else 0.0)
    coin(img, right[0], right[1], 64 * s, "€", "EUR", pulse=arrive)

    # The label riding the top of the route.
    pill = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pw, ph = 168 * s, 42 * s
    px, py = 380 * s - pw / 2, 30 * s + math.sin(t * 2 * math.pi) * 3 * s
    pd.rounded_rectangle([px, py, px + pw, py + ph], radius=ph / 2, fill=(255, 244, 230, 245))
    pd.ellipse([px + 14 * s, py + 12 * s, px + 32 * s, py + 30 * s], fill=ORANGE + (255,))
    pd.line([(px + 18 * s, py + 21 * s), (px + 22 * s, py + 25 * s), (px + 29 * s, py + 16 * s)], fill=(255, 255, 255, 255), width=int(2.4 * s), joint="curve")
    pf = font(17 * s)
    pd.text((px + 42 * s, py + 9 * s), "Best price", font=pf, fill=INK + (255,))
    img.alpha_composite(pill)

    return img.convert("RGB").resize((W, H), Image.LANCZOS)


def build_hero():
    bg = background()
    dots = dots_layer()
    frames = [draw_frame(i, bg, dots) for i in range(FRAMES)]
    # One palette for every frame, so the colours don't flicker between them.
    palette_source = Image.new("RGB", (W, H * 3))
    for i, k in enumerate([0, FRAMES // 3, 2 * FRAMES // 3]):
        palette_source.paste(frames[k], (0, i * H))
    palette = palette_source.quantize(colors=112, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    paletted = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    buffer = io.BytesIO()
    paletted[0].save(buffer, format="GIF", save_all=True, append_images=paletted[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
    return buffer.getvalue(), frames[0]


# ---- small icon tiles -------------------------------------------------------

ICON = 112
IS = 4


def tile(background_color):
    img = Image.new("RGBA", (ICON * IS, ICON * IS), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, ICON * IS - 1, ICON * IS - 1], radius=30 * IS, fill=background_color + (255,))
    return img


def finish(img):
    out = img.resize((ICON, ICON), Image.LANCZOS)
    buffer = io.BytesIO()
    out.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def icon_compare():
    img = tile((253, 235, 227))
    d = ImageDraw.Draw(img)
    s = IS
    for x, top, color in [(28, 62, (226, 160, 138)), (50, 38, (200, 68, 32)), (72, 54, (226, 160, 138))]:
        d.rounded_rectangle([x * s, top * s, (x + 14) * s, 86 * s], radius=5 * s, fill=color + (255,))
    return finish(img)


def icon_bell():
    img = tile((229, 243, 236))
    d = ImageDraw.Draw(img)
    s, green = IS, (11, 122, 67, 255)
    d.pieslice([36 * s, 26 * s, 76 * s, 66 * s], 180, 360, fill=green)
    d.polygon([(36 * s, 46 * s), (76 * s, 46 * s), (84 * s, 78 * s), (28 * s, 78 * s)], fill=green)
    d.rounded_rectangle([26 * s, 74 * s, 86 * s, 82 * s], radius=4 * s, fill=green)
    d.ellipse([49 * s, 82 * s, 63 * s, 96 * s], fill=green)
    d.ellipse([52 * s, 18 * s, 60 * s, 26 * s], fill=green)
    return finish(img)


def icon_api():
    img = tile((233, 238, 251))
    d = ImageDraw.Draw(img)
    s, blue = IS, (47, 95, 208, 255)
    d.line([(44 * s, 34 * s), (24 * s, 56 * s), (44 * s, 78 * s)], fill=blue, width=8 * s, joint="curve")
    d.line([(68 * s, 34 * s), (88 * s, 56 * s), (68 * s, 78 * s)], fill=blue, width=8 * s, joint="curve")
    d.line([(61 * s, 30 * s), (51 * s, 82 * s)], fill=(47, 95, 208, 200), width=6 * s)
    for p in [(24 * s, 56 * s), (44 * s, 34 * s), (44 * s, 78 * s), (68 * s, 34 * s), (68 * s, 78 * s), (88 * s, 56 * s)]:
        d.ellipse([p[0] - 4 * s, p[1] - 4 * s, p[0] + 4 * s, p[1] + 4 * s], fill=blue)
    return finish(img)


def icon_lock():
    img = tile((241, 238, 232))
    d = ImageDraw.Draw(img)
    s = IS
    d.arc([38 * s, 22 * s, 74 * s, 62 * s], 180, 360, fill=INK + (255,), width=7 * s)
    d.line([(41.5 * s, 42 * s), (41.5 * s, 54 * s)], fill=INK + (255,), width=7 * s)
    d.line([(70.5 * s, 42 * s), (70.5 * s, 54 * s)], fill=INK + (255,), width=7 * s)
    d.rounded_rectangle([30 * s, 50 * s, 82 * s, 88 * s], radius=9 * s, fill=INK + (255,))
    d.ellipse([51 * s, 61 * s, 61 * s, 71 * s], fill=ORANGE_SOFT + (255,))
    d.rounded_rectangle([54 * s, 68 * s, 58 * s, 79 * s], radius=2 * s, fill=ORANGE_SOFT + (255,))
    return finish(img)


def main():
    hero, first = build_hero()
    assets = {
        "hero": base64.b64encode(hero).decode("ascii"),
        "compare": base64.b64encode(icon_compare()).decode("ascii"),
        "bell": base64.b64encode(icon_bell()).decode("ascii"),
        "api": base64.b64encode(icon_api()).decode("ascii"),
        "lock": base64.b64encode(icon_lock()).decode("ascii"),
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(assets, handle, indent=2)
        handle.write("\n")
    preview = sys.argv[1] if len(sys.argv) > 1 else None
    if preview:
        os.makedirs(preview, exist_ok=True)
        with open(os.path.join(preview, "hero.gif"), "wb") as handle:
            handle.write(hero)
        first.save(os.path.join(preview, "hero-frame0.png"))
    print({name: len(base64.b64decode(value)) for name, value in assets.items()})


if __name__ == "__main__":
    main()

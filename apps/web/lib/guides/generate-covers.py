"""
Draws the cover pictures for the India guides (public/images/guides/<slug>.jpg,
1200x440). Every skyline is drawn here from plain shapes: stylised silhouettes of
well-known landmarks, not photographs and not traced from anyone's artwork.

    python apps/web/lib/guides/generate-covers.py

Needs Pillow. Run it again after changing a title or a city.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "images", "guides"))

W, H = 1200, 440
S = 2  # supersampling

NAVY_TOP, NAVY_BOTTOM = (14, 26, 58), (30, 48, 100)
ORANGE = (232, 106, 48)
CREAM = (255, 244, 230)

# slug -> (cover title, left city, right city, sender symbol, receiver symbol)
COVERS = {
    "best-money-transfer-services": ("The best money transfer services, ranked live", "usa", "uk", "$", "€"),
    "send-money-from-india-to-usa": ("Send money from India to the USA", "india", "usa", "₹", "$"),
    "best-money-transfer-app-in-india": ("Best money transfer app in India", "india", "india", "₹", "$"),
    "cheapest-way-to-send-money-abroad-from-india": ("Cheapest way to send money abroad", "india", "uk", "₹", "£"),
    "lrs-limit-and-tcs-explained": ("LRS limit and TCS explained", "india", "usa", "₹", "$"),
    "receive-money-from-abroad-in-india": ("Receive money from abroad in India", "usa", "india", "$", "₹"),
    "send-money-from-india-to-uk": ("Send money from India to the UK", "india", "uk", "₹", "£"),
    "send-money-from-india-to-canada": ("Send money from India to Canada", "india", "canada", "₹", "$"),
    "send-money-from-india-to-australia": ("Send money from India to Australia", "india", "australia", "₹", "$"),
    "send-money-from-india-to-uae": ("Send money from India to the UAE", "india", "uae", "₹", "AED"),
    "send-money-from-india-to-singapore": ("Send money from India to Singapore", "india", "singapore", "₹", "$"),
    "send-money-abroad-for-study-from-india": ("Send money abroad for study", "india", "uk", "₹", "£"),
    "swift-charges-our-sha-ben-explained": ("SWIFT charges: OUR, SHA, BEN", "network", "network", "$", "€"),
    "is-this-money-transfer-service-safe-in-india": ("Is your transfer service safe?", "shield", "shield", "₹", "$"),
    "send-money-to-india-nre-nro-accounts": ("Sending money to India: NRE and NRO", "usa", "india", "$", "₹"),
}


def font(size, black=True):
    names = ["seguibl.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"] if black else ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
    folders = [r"C:\Windows\Fonts", "/usr/share/fonts/truetype/dejavu", "/Library/Fonts", "/System/Library/Fonts/Supplemental"]
    for folder in folders:
        for name in names:
            path = os.path.join(folder, name)
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def sky():
    img = Image.new("RGB", (W * S, H * S))
    d = ImageDraw.Draw(img)
    for y in range(H * S):
        d.line([(0, y), (W * S, y)], fill=lerp(NAVY_TOP, NAVY_BOTTOM, y / (H * S)))
    glow = Image.new("L", (W * S, H * S), 0)
    ImageDraw.Draw(glow).ellipse([-220 * S, 150 * S, 520 * S, 640 * S], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(120 * S / 2))
    img = Image.composite(Image.new("RGB", img.size, ORANGE), img, glow.point(lambda v: int(v * 0.42)))
    rng = random.Random(11)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for _ in range(110):
        x, y = rng.randrange(0, W * S), rng.randrange(0, int(H * S * 0.7))
        r = rng.choice([1, 1.4, 2]) * S / 2
        ld.ellipse([x - r, y - r, x + r, y + r], fill=(255, 235, 215, rng.choice([30, 50, 80])))
    out = img.convert("RGBA")
    out.alpha_composite(layer)
    return out


# ---- skylines: each draws into `d` with its left edge at x, standing on y --------------------------------

FAR, MID, NEAR = (36, 56, 110, 255), (22, 38, 84, 255), (11, 20, 46, 255)


def windows(d, x0, y0, x1, y1, seed, step=14):
    rng = random.Random(seed)
    for wx in range(int(x0) + 6 * S, int(x1) - 4 * S, step * S):
        for wy in range(int(y0) + 8 * S, int(y1) - 6 * S, step * S):
            if rng.random() < 0.18:
                d.rectangle([wx, wy, wx + 3 * S, wy + 5 * S], fill=(255, 214, 140, 200))


def towers(d, x, y, widths_heights, color, seed):
    cx = x
    for w, h in widths_heights:
        d.rectangle([cx, y - h * S, cx + w * S, y], fill=color)
        windows(d, cx, y - h * S, cx + w * S, y, seed + int(cx))
        cx += w * S
    return cx


def city_india(d, x, y):
    towers(d, x, y, [(34, 70), (28, 95), (40, 62), (30, 80), (36, 55), (30, 88), (34, 66)], MID, 3)
    # Gateway-style arch monument
    gx, gw, gh = x + 120 * S, 150 * S, 112 * S
    d.rectangle([gx, y - gh, gx + gw, y], fill=NEAR)
    d.pieslice([gx + 38 * S, y - gh + 22 * S, gx + gw - 38 * S, y - gh + 22 * S + 2 * 50 * S], 180, 360, fill=(36, 56, 110, 255))
    d.rectangle([gx + 38 * S, y - gh + 47 * S, gx + gw - 38 * S, y], fill=(36, 56, 110, 255))
    for tx in (gx, gx + gw - 18 * S):
        d.rectangle([tx, y - gh - 22 * S, tx + 18 * S, y - gh], fill=NEAR)
        d.polygon([(tx, y - gh - 22 * S), (tx + 9 * S, y - gh - 38 * S), (tx + 18 * S, y - gh - 22 * S)], fill=NEAR)
    d.pieslice([gx + 46 * S, y - gh - 30 * S, gx + gw - 46 * S, y - gh + 22 * S], 180, 360, fill=NEAR)
    # a cable-stayed bridge
    bx = x + 330 * S
    d.rectangle([bx, y - 14 * S, bx + 250 * S, y - 8 * S], fill=NEAR)
    px = bx + 110 * S
    d.polygon([(px, y - 150 * S), (px + 8 * S, y - 150 * S), (px + 14 * S, y - 8 * S), (px - 6 * S, y - 8 * S)], fill=NEAR)
    for k in range(1, 8):
        d.line([(px + 4 * S, y - 146 * S), (px + 4 * S - k * 15 * S, y - 12 * S)], fill=NEAR, width=S)
        d.line([(px + 4 * S, y - 146 * S), (px + 4 * S + k * 15 * S, y - 12 * S)], fill=NEAR, width=S)


def city_usa(d, x, y):
    towers(d, x, y, [(40, 120), (34, 160), (44, 100), (30, 190), (38, 140), (46, 110), (34, 170), (40, 90), (36, 130)], MID, 5)
    # a stepped tower with a spire
    ex = x + 150 * S
    d.rectangle([ex, y - 150 * S, ex + 80 * S, y], fill=NEAR)
    d.rectangle([ex + 12 * S, y - 215 * S, ex + 68 * S, y - 150 * S], fill=NEAR)
    d.rectangle([ex + 24 * S, y - 262 * S, ex + 56 * S, y - 215 * S], fill=NEAR)
    d.polygon([(ex + 30 * S, y - 262 * S), (ex + 40 * S, y - 330 * S), (ex + 50 * S, y - 262 * S)], fill=NEAR)
    windows(d, ex, y - 150 * S, ex + 80 * S, y, 9)
    towers(d, x + 250 * S, y, [(36, 104), (30, 150), (44, 96), (34, 124)], NEAR, 15)


def city_uk(d, x, y):
    towers(d, x, y, [(40, 80), (34, 110), (44, 70), (30, 96)], MID, 21)
    # a clock tower
    cx = x + 190 * S
    d.rectangle([cx, y - 215 * S, cx + 44 * S, y], fill=NEAR)
    d.rectangle([cx - 5 * S, y - 245 * S, cx + 49 * S, y - 215 * S], fill=NEAR)
    d.polygon([(cx - 5 * S, y - 245 * S), (cx + 22 * S, y - 320 * S), (cx + 49 * S, y - 245 * S)], fill=NEAR)
    d.ellipse([cx + 9 * S, y - 200 * S, cx + 35 * S, y - 174 * S], fill=(255, 214, 140, 235))
    # a twin-towered bridge
    bx = x + 280 * S
    for tx in (bx, bx + 170 * S):
        d.rectangle([tx, y - 120 * S, tx + 30 * S, y], fill=NEAR)
        d.polygon([(tx - 3 * S, y - 120 * S), (tx + 15 * S, y - 156 * S), (tx + 33 * S, y - 120 * S)], fill=NEAR)
    d.rectangle([bx + 30 * S, y - 84 * S, bx + 170 * S, y - 76 * S], fill=NEAR)
    d.arc([bx + 30 * S, y - 60 * S, bx + 170 * S, y + 60 * S], 180, 360, fill=NEAR, width=3 * S)
    # a big wheel
    wx, wy, r = x + 520 * S, y - 90 * S, 78 * S
    d.ellipse([wx - r, wy - r, wx + r, wy + r], outline=NEAR, width=4 * S)
    for k in range(12):
        a = k * math.pi / 6
        d.line([(wx, wy), (wx + r * math.cos(a), wy + r * math.sin(a))], fill=NEAR, width=S)
    d.polygon([(wx - 14 * S, y), (wx, wy), (wx + 14 * S, y)], fill=NEAR)


def city_canada(d, x, y):
    towers(d, x, y, [(36, 110), (30, 150), (40, 94), (34, 130), (44, 100), (30, 140)], MID, 31)
    tx = x + 250 * S
    d.polygon([(tx, y), (tx + 9 * S, y - 230 * S), (tx + 15 * S, y - 230 * S), (tx + 24 * S, y)], fill=NEAR)
    d.ellipse([tx - 18 * S, y - 250 * S, tx + 42 * S, y - 212 * S], fill=NEAR)
    d.rectangle([tx + 10 * S, y - 330 * S, tx + 14 * S, y - 250 * S], fill=NEAR)
    towers(d, x + 320 * S, y, [(40, 120), (34, 160), (46, 104), (36, 134), (40, 90)], NEAR, 33)


def city_australia(d, x, y):
    towers(d, x, y, [(40, 70), (34, 96), (44, 60)], MID, 41)
    ox = x + 140 * S
    shells = [(0, 90, 150), (45, 105, 200), (105, 80, 140), (150, 60, 110)]
    for dx, w, h in shells:
        d.pieslice([ox + dx * S, y - h * S, ox + (dx + w) * S, y + h * S], 180, 270, fill=NEAR)
    d.rectangle([ox - 10 * S, y - 16 * S, ox + 240 * S, y], fill=NEAR)
    bx = x + 400 * S
    d.arc([bx, y - 170 * S, bx + 330 * S, y + 60 * S], 180, 360, fill=NEAR, width=9 * S)
    d.rectangle([bx, y - 56 * S, bx + 330 * S, y - 46 * S], fill=NEAR)
    for k in range(1, 12):
        px = bx + k * 27 * S
        d.line([(px, y - 50 * S), (px, y - 50 * S - 100 * S * math.sin(k * math.pi / 12))], fill=NEAR, width=S)


def city_uae(d, x, y):
    towers(d, x, y, [(36, 100), (30, 140), (40, 90), (34, 120), (44, 104)], MID, 51)
    bx = x + 220 * S
    layers = [(60, 120), (46, 200), (34, 270), (22, 330), (12, 380)]
    cur = y
    for w, top in layers:
        d.polygon([(bx + (30 - w / 2) * S, cur), (bx + (30 - w / 2) * S, y - top * S), (bx + (30 + w / 2) * S, y - top * S), (bx + (30 + w / 2) * S, cur)], fill=NEAR)
        cur = y - (top - 6) * S
    d.rectangle([bx + 28 * S, y - 430 * S, bx + 32 * S, y - 380 * S], fill=NEAR)
    sx = x + 380 * S
    d.pieslice([sx, y - 220 * S, sx + 120 * S, y + 60 * S], 270, 360, fill=NEAR)
    d.polygon([(sx + 60 * S, y - 220 * S), (sx + 60 * S, y), (sx, y)], fill=NEAR)
    towers(d, x + 520 * S, y, [(40, 130), (34, 96), (44, 150), (36, 110)], NEAR, 53)


def city_singapore(d, x, y):
    towers(d, x, y, [(36, 110), (30, 150), (40, 100), (34, 130)], MID, 61)
    mx = x + 170 * S
    for k in range(3):
        left = mx + k * 52 * S
        d.polygon([(left, y), (left + 14 * S, y - 210 * S), (left + 44 * S, y - 210 * S), (left + 50 * S, y)], fill=NEAR)
    d.rounded_rectangle([mx - 20 * S, y - 238 * S, mx + 190 * S, y - 210 * S], radius=12 * S, fill=NEAR)
    for k in range(3):
        d.pieslice([x + 420 * S + k * 70 * S, y - 90 * S, x + 480 * S + k * 70 * S, y + 30 * S], 180, 360, fill=NEAR)
    towers(d, x + 650 * S, y, [(40, 120), (34, 160), (46, 100)], NEAR, 63)


def motif_network(d, x, y):
    rng = random.Random(4)
    nodes = [(x + rng.randrange(40, 540) * S, y - rng.randrange(40, 280) * S) for _ in range(12)]
    for i, a in enumerate(nodes):
        for b in nodes[i + 1:]:
            if math.hypot(a[0] - b[0], a[1] - b[1]) < 190 * S:
                d.line([a, b], fill=(120, 150, 220, 130), width=2 * S)
    for a in nodes:
        d.ellipse([a[0] - 9 * S, a[1] - 9 * S, a[0] + 9 * S, a[1] + 9 * S], fill=(255, 214, 160, 230))
        d.ellipse([a[0] - 4 * S, a[1] - 4 * S, a[0] + 4 * S, a[1] + 4 * S], fill=ORANGE + (255,))


def motif_shield(d, x, y):
    cx, cy, w, h = x + 300 * S, y - 150 * S, 150 * S, 190 * S
    d.polygon([(cx - w, cy - h * 0.7), (cx, cy - h), (cx + w, cy - h * 0.7), (cx + w, cy), (cx, cy + h * 0.9), (cx - w, cy)], fill=(36, 56, 110, 255))
    inner = 0.82
    d.polygon([(cx - w * inner, cy - h * 0.62), (cx, cy - h * 0.9), (cx + w * inner, cy - h * 0.62), (cx + w * inner, cy - 6 * S), (cx, cy + h * 0.78), (cx - w * inner, cy - 6 * S)], fill=(255, 244, 230, 255))
    d.line([(cx - 60 * S, cy - 10 * S), (cx - 14 * S, cy + 40 * S), (cx + 66 * S, cy - 70 * S)], fill=(200, 68, 32, 255), width=16 * S, joint="curve")


CITIES = {"india": city_india, "usa": city_usa, "uk": city_uk, "canada": city_canada, "australia": city_australia, "uae": city_uae, "singapore": city_singapore, "network": motif_network, "shield": motif_shield}


def wrap(draw, text, fnt, max_width):
    words, lines, current = text.upper().split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def coin(img, cx, cy, r, symbol, tone):
    """A coin with a soft shadow. Translucent shapes go on their own layer: ImageDraw replaces pixels on an RGBA image instead of blending."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([cx - r, cy - r + 6 * S, cx + r, cy + r + 6 * S], fill=(0, 0, 0, 90))
    layer = layer.filter(ImageFilter.GaussianBlur(5 * S))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tone)
    d.ellipse([cx - r + 5 * S, cy - r + 5 * S, cx + r - 5 * S, cy + r - 5 * S], outline=lerp(tone[:3], (255, 255, 255), 0.5) + (255,), width=2 * S)
    f = font(int(r * (1.15 if len(symbol) == 1 else 0.62)))
    box = d.textbbox((0, 0), symbol, font=f)
    d.text((cx - (box[0] + box[2]) / 2, cy - (box[1] + box[3]) / 2 - 2 * S), symbol, font=f, fill=(40, 26, 12, 255))


def render(slug, title, left, right, a_symbol, b_symbol):
    img = sky()
    base = H * S
    # skylines: the sender's city smaller on the left (so the title has room), the receiver's tall on the right
    far = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(far)
    if left == right and left in ("network", "shield"):
        CITIES[left](fd, 560 * S, base)
    else:
        near = Image.new("RGBA", img.size, (0, 0, 0, 0))
        CITIES[left](ImageDraw.Draw(near), 0, base)
        region = near.crop((0, 0, 720 * S, base))
        small = region.resize((int(region.width * 0.66), int(region.height * 0.66)), Image.LANCZOS)
        far.alpha_composite(small, (30 * S, base - small.height))
        CITIES[right](fd, 640 * S, base)
    img.alpha_composite(far)

    # accent bar, tag, title: the tag's translucent fill goes on its own layer
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 14 * S, H * S], fill=ORANGE + (255,))
    chip = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(chip).rounded_rectangle([46 * S, 34 * S, 176 * S, 64 * S], radius=8 * S, fill=(255, 255, 255, 40))
    img.alpha_composite(chip)
    d = ImageDraw.Draw(img)
    d.text((60 * S, 40 * S), "IN GUIDES", font=font(16 * S, black=False), fill=(255, 255, 255, 240))
    title_f = font(50 * S)
    lines = wrap(d, title, title_f, 560 * S)
    y = 84 * S
    for line in lines[:3]:
        d.text((46 * S, y), line, font=title_f, fill=(255, 255, 255, 255))
        y += 58 * S
    # a sender-to-receiver currency chip under the title
    cy = y + 34 * S
    coin(img, 76 * S, cy, 28 * S, a_symbol, (255, 205, 120, 255))
    d = ImageDraw.Draw(img)
    d.line([(118 * S, cy), (160 * S, cy)], fill=(255, 220, 190, 255), width=4 * S)
    d.polygon([(160 * S, cy - 9 * S), (176 * S, cy), (160 * S, cy + 9 * S)], fill=(255, 220, 190, 255))
    coin(img, 220 * S, cy, 28 * S, b_symbol, (226, 232, 244, 255))

    out = img.convert("RGB").resize((W, H), Image.LANCZOS)
    path = os.path.join(OUT, f"{slug}.jpg")
    out.save(path, "JPEG", quality=84, optimize=True, progressive=True)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    for slug, spec in COVERS.items():
        path = render(slug, *spec)
        print(os.path.basename(path), os.path.getsize(path))


if __name__ == "__main__":
    main()

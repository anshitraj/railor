"""
Draws the six illustrated tiles for the home page collage
(public/images/collage/tile-*.png, 480x600), in the landing page's palette:
warm cream and peach, burgundy and orange, glossy flags and coins, and little
product moments (a transfer arriving, a rate going up, an invoice matched).

    python apps/web/lib/media/generate-collage.py

Needs Pillow. Flags are read from public/flags is not possible (SVG), so they are
drawn here as simple stripes for the countries used.
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "images", "collage"))
W, H, S = 480, 600, 2

INK, ORANGE, BRAND, CREAM = (21, 19, 16), (233, 86, 42), (90, 1, 36), (253, 247, 237)


def font(size, bold=True):
    for name in (["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        path = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size * S)
    return ImageFont.load_default()


def gradient(top, bottom):
    img = Image.new("RGB", (W * S, H * S))
    d = ImageDraw.Draw(img)
    for y in range(H * S):
        t = y / (H * S)
        d.line([(0, y), (W * S, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img.convert("RGBA")


def shadow(img, box, radius, blur=18, alpha=70, dy=14):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = [v * S for v in box]
    ImageDraw.Draw(layer).rounded_rectangle([x0, y0 + dy * S, x1, y1 + dy * S], radius * S, fill=(60, 30, 10, alpha))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur * S)))


def card(img, box, radius=26, fill=(255, 255, 255, 255)):
    shadow(img, box, radius)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle([v * S for v in box], radius * S, fill=fill)
    img.alpha_composite(layer)


FLAGS = {
    "IN": [(255, 153, 51), (255, 255, 255), (19, 136, 8)],
    "DE": [(20, 20, 20), (221, 0, 0), (255, 206, 0)],
    "AE": [(0, 115, 47), (255, 255, 255), (20, 20, 20)],
    "NG": [(0, 135, 81), (255, 255, 255), (0, 135, 81)],
    "FR": [(0, 85, 164), (255, 255, 255), (239, 65, 53)],
    "MX": [(0, 104, 71), (255, 255, 255), (206, 17, 38)],
}
VERTICAL = {"NG", "FR", "MX"}


def flag(img, cx, cy, r, code):
    shadow(img, (cx - r, cy - r, cx + r, cy + r), r, blur=10, alpha=80, dy=8)
    size = 2 * r * S
    tile = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(tile)
    colors = FLAGS[code]
    for i, c in enumerate(colors):
        if code in VERTICAL:
            d.rectangle([i * size / 3, 0, (i + 1) * size / 3, size], fill=c)
        else:
            d.rectangle([0, i * size / 3, size, (i + 1) * size / 3], fill=c)
    if code == "IN":
        d.ellipse([size / 2 - size / 12, size / 2 - size / 12, size / 2 + size / 12, size / 2 + size / 12], outline=(0, 0, 128), width=max(2, size // 60))
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse([size * .14, size * .08, size * .62, size * .42], fill=(255, 255, 255, 90))
    tile.alpha_composite(gloss.filter(ImageFilter.GaussianBlur(size / 30)))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    ring = Image.new("RGBA", (size + 8 * S, size + 8 * S), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([0, 0, size + 8 * S - 1, size + 8 * S - 1], fill=(255, 255, 255, 255))
    img.alpha_composite(ring, ((cx - r) * S - 4 * S, (cy - r) * S - 4 * S))
    img.paste(tile, ((cx - r) * S, (cy - r) * S), mask)


def coin(img, cx, cy, r, sym, metal="gold"):
    shadow(img, (cx - r, cy - r, cx + r, cy + r), r, blur=10, alpha=90, dy=8)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    edge, face, ink = ((176, 122, 36), (242, 196, 92), (122, 79, 14)) if metal == "gold" else ((139, 146, 155), (222, 226, 231), (77, 81, 87))
    d.ellipse([(cx - r) * S, (cy - r + 5) * S, (cx + r) * S, (cy + r + 5) * S], fill=edge)
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=face)
    d.ellipse([(cx - r * .8) * S, (cy - r * .8) * S, (cx + r * .8) * S, (cy + r * .8) * S], outline=edge, width=2 * S)
    f = font(int(r * .9))
    d.text((cx * S, cy * S), sym, font=f, fill=ink, anchor="mm")
    img.alpha_composite(layer)


def text(img, xy, s, size, fill=INK, bold=True, anchor="la"):
    ImageDraw.Draw(img).text((xy[0] * S, xy[1] * S), s, font=font(size, bold), fill=fill, anchor=anchor)


def pill(img, box, label, bg, fg, size=15):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle([v * S for v in box], (box[3] - box[1]) / 2 * S, fill=bg)
    img.alpha_composite(layer)
    text(img, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), label, size, fg, anchor="mm")


def bars(img, x, y, w, rows):
    for i, (frac, color) in enumerate(rows):
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle([x * S, (y + i * 30) * S, (x + w) * S, (y + i * 30 + 14) * S], 7 * S, fill=(243, 235, 224, 255))
        d.rounded_rectangle([x * S, (y + i * 30) * S, (x + w * frac) * S, (y + i * 30 + 14) * S], 7 * S, fill=color)
        img.alpha_composite(layer)


def tile_arrived():
    img = gradient((253, 236, 218), (247, 210, 180))
    flag(img, 110, 120, 42, "IN")
    coin(img, 370, 110, 46, "₹")
    card(img, (50, 250, 430, 470))
    text(img, (80, 290), "Money arrived", 26)
    text(img, (80, 326), "In the bank account, on time", 17, (120, 110, 100), bold=False)
    pill(img, (80, 380, 240, 420), "Received", (220, 243, 228, 255), (31, 138, 76), 17)
    coin(img, 380, 520, 34, "$")
    return img


def tile_compare():
    img = gradient((246, 239, 228), (236, 222, 204))
    card(img, (60, 90, 420, 470))
    text(img, (90, 130), "Best price today", 22)
    for i, (frac, label) in enumerate([(0.92, "Option A"), (0.74, "Option B"), (0.58, "Option C")]):
        y = 180 + i * 80
        text(img, (90, y), label, 17, (90, 82, 74), bold=False)
        bars(img, 90, y + 28, 300, [(frac, ORANGE + (255,) if i == 0 else (201, 191, 178, 255))])
    pill(img, (300, 116, 400, 150), "Best", ORANGE + (255,), (255, 255, 255), 15)
    flag(img, 90, 530, 30, "DE")
    flag(img, 160, 540, 26, "FR")
    coin(img, 400, 530, 36, "€", "silver")
    return img


def tile_rate():
    img = gradient((233, 240, 251), (214, 227, 246))
    card(img, (50, 120, 430, 420))
    text(img, (80, 160), "Rate update", 22)
    text(img, (80, 192), "Smart · when it moves", 16, (120, 110, 100), bold=False)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = [(80, 360), (130, 340), (170, 350), (220, 310), (270, 318), (320, 270), (360, 280), (400, 240)]
    d.line([(x * S, y * S) for x, y in pts], fill=ORANGE + (255,), width=4 * S, joint="curve")
    d.ellipse([(400 - 7) * S, (240 - 7) * S, (400 + 7) * S, (240 + 7) * S], fill=ORANGE + (255,))
    img.alpha_composite(layer)
    flag(img, 100, 500, 34, "AE")
    coin(img, 380, 70, 40, "$")
    return img


def tile_paid():
    img = gradient((247, 233, 238), (236, 207, 216))
    card(img, (60, 110, 420, 430))
    text(img, (90, 150), "Invoice #1042", 22)
    for i, w in enumerate((240, 180, 210)):
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle([90 * S, (200 + i * 34) * S, (90 + w) * S, (214 + i * 34) * S], 7 * S, fill=(240, 228, 232, 255))
        img.alpha_composite(layer)
    pill(img, (90, 340, 290, 380), "Matched to the credit", (220, 243, 228, 255), (31, 138, 76), 15)
    coin(img, 380, 500, 44, "£")
    flag(img, 110, 510, 32, "NG")
    return img


def tile_route():
    img = gradient((50, 12, 28), (24, 16, 14))
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(7):
        y = 140 + i * 50
        d.line([(0, (y + 40) * S), (W * S, (y - 40) * S)], fill=(255, 236, 214, 40), width=2 * S)
    d.line([(80 * S, 430 * S), (240 * S, 260 * S), (400 * S, 170 * S)], fill=ORANGE + (255,), width=4 * S, joint="curve")
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(1)))
    flag(img, 80, 430, 38, "MX")
    flag(img, 400, 170, 38, "DE")
    text(img, (240, 520), "Every route, compared", 24, CREAM, anchor="mm")
    return img


def tile_coins():
    img = gradient((253, 241, 223), (244, 220, 181))
    coin(img, 170, 200, 78, "$")
    coin(img, 320, 300, 62, "€", "silver")
    coin(img, 180, 400, 56, "₹")
    coin(img, 340, 470, 44, "£", "silver")
    flag(img, 360, 140, 34, "IN")
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, make in [("arrived", tile_arrived), ("compare", tile_compare), ("rate", tile_rate), ("paid", tile_paid), ("route", tile_route), ("coins", tile_coins)]:
        img = make().resize((W, H), Image.LANCZOS).convert("RGB")
        path = os.path.join(OUT, "tile-%s.jpg" % name)
        img.save(path, quality=86, optimize=True, progressive=True)
        print(path, os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    main()

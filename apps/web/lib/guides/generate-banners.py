"""
Draws the cover picture of every guide: public/images/guides/<slug>.svg (1200x440).

Each cover is a small product scene (a phone, a receipt, bank details, a ranking)
for that guide, with the Railor mark, country flags from public/flags and the
provider logos from public/brand/providers embedded, so a card still looks right
when it is shown as a plain image. Provider logos only ever sit in an unordered
group; nothing here ranks or praises a provider.

    python apps/web/lib/guides/generate-banners.py

Needs Pillow. Run it again after adding a guide or changing a scene.
"""
import base64
import io
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "..", "public"))
OUT = os.path.join(PUBLIC, "images", "guides")
W, H = 1200, 440

INK, MUTED, LINE, SKEL = "#151310", "#8a8178", "#eadfcf", "#efe6d8"
ORANGE, ORANGE_DEEP, BRAND = "#e9562a", "#c2410c", "#5a0124"
GREEN, GREEN_BG, BLUE, BLUE_BG, AMBER, AMBER_BG = "#1f8a4c", "#dcf3e4", "#2f6fd6", "#dfeafb", "#a96a00", "#fdf0d2"
FONT = "Inter, 'Segoe UI', Arial, sans-serif"
MONO = "ui-monospace, 'SF Mono', Consolas, monospace"

BG = {
    "getting": ("#fbf1df", "#f4dcb5"),
    "ways": ("#f8e9df", "#efd3c1"),
    "bank": ("#ecefe6", "#d9ded0"),
    "india": ("#fdeadb", "#f7d2b0"),
    "rates": ("#e3efff", "#c6dcf5"),
}


def b64(raw):
    return base64.b64encode(raw).decode("ascii")


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def file_bytes(*parts):
    with open(os.path.join(PUBLIC, *parts), "rb") as fh:
        return fh.read()


LOGO_FILES = {
    "wise": "wise.png", "remitly": "remitly.png", "xoom": "xoom.png", "western-union": "western-union.webp",
    "moneygram": "moneygram.webp", "paypal": "paypal.webp", "payoneer": "payoneer.webp", "nium": "nium.webp",
    "airwallex": "airwallex.webp", "sendwave": "sendwave.png", "pingpong": "pingpong.webp", "dashx": "dashx.webp",
    "icici": "icici-bank.webp", "revolut": "revolut.svg", "worldremit": "worldremit.svg", "xerof": "xerof.webp",
}
_logo_cache = {}


def logo_info(name):
    """(data URI, aspect ratio, fills its tile edge to edge). Raster marks are trimmed and shrunk to keep the SVG small."""
    if name in _logo_cache:
        return _logo_cache[name]
    fname = LOGO_FILES[name]
    path = os.path.join(PUBLIC, "brand", "providers", fname)
    if fname.endswith(".svg"):
        with open(path, "rb") as fh:
            raw = fh.read()
        info = ("data:image/svg+xml;base64," + b64(raw), 1.0, False)
    else:
        im = Image.open(path).convert("RGBA")
        corners = [im.getpixel(p)[3] for p in ((0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1))]
        bleed = min(corners) > 200
        box = im.getchannel("A").getbbox()
        if box and not bleed:
            im = im.crop(box)
        im.thumbnail((96, 96), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
        info = ("data:image/png;base64," + b64(buf.getvalue()), im.width / im.height, bleed)
    _logo_cache[name] = info
    return info


class Cover:
    def __init__(self, topic, bg=None):
        self.topic = topic
        self.bg = bg or BG[topic]
        self.defs, self.out, self.keys, self.n = [], [], set(), 0

    def once(self, key, xml):
        if key not in self.keys:
            self.keys.add(key)
            self.defs.append(xml)

    def add(self, xml):
        self.out.append(xml)

    # ---- primitives ------------------------------------------------------------------------------------------
    def text(self, x, y, s, size=16, weight=600, fill=INK, anchor="start", ls=0, family=FONT):
        self.add('<text x="%s" y="%s" font-family="%s" font-size="%s" font-weight="%s" fill="%s" text-anchor="%s" letter-spacing="%s">%s</text>' % (x, y, family, size, weight, fill, anchor, ls, esc(s)))

    def rect(self, x, y, w, h, fill, r=0, extra=""):
        self.add('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"%s/>' % (x, y, w, h, r, fill, extra))

    def card(self, x, y, w, h, r=22, fill="#fff", shadow="lift"):
        self.add('<g filter="url(#%s)"><rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"/></g>' % (shadow, x, y, w, h, r, fill))

    def pill(self, x, y, label, bg, fg, size=13, h=26, pad=12, anchor="start"):
        w = round(len(label) * size * 0.6 + pad * 2)
        left = x - w / 2 if anchor == "middle" else x
        self.rect(left, y, w, h, bg, h / 2)
        self.text(left + w / 2, y + h / 2 + size * 0.35, label, size, 700, fg, "middle")
        return w

    def skel(self, x, y, w, h=10, fill=SKEL):
        self.rect(x, y, w, h, fill, h / 2)

    def check(self, cx, cy, r=11, fill=GREEN):
        self.add('<circle cx="%s" cy="%s" r="%s" fill="%s"/><path d="M%s %s l%s %s l%s %s" fill="none" stroke="#fff" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"/>'
                 % (cx, cy, r, fill, cx - r * 0.42, cy + r * 0.02, r * 0.28, r * 0.3, r * 0.5, -r * 0.55, max(2, r * 0.2)))

    def coin(self, cx, cy, r, sym, metal="gold", rot=0):
        shade, ring, ink = ("#c8901c", "#b7801a", "#8a5a06") if metal == "gold" else ("#a7b0bd", "#8c97a6", "#5d6672")
        size = r * (0.95 if len(sym) == 1 else 0.6)
        self.add('<g transform="rotate(%s %s %s)" filter="url(#soft)"><circle cx="%s" cy="%s" r="%s" fill="%s"/><circle cx="%s" cy="%s" r="%s" fill="url(#%s)"/><circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="%s" opacity=".55"/>'
                 '<text x="%s" y="%s" font-family="%s" font-size="%s" font-weight="800" fill="%s" text-anchor="middle">%s</text></g>'
                 % (rot, cx, cy, cx, cy + r * 0.1, r, shade, cx, cy, r, metal, cx, cy, r * 0.8, ring, r * 0.05, cx, cy + size * 0.34, FONT, size, ink, esc(sym)))

    def flag(self, cx, cy, r, code):
        uri = "data:image/svg+xml;base64," + b64(file_bytes("flags", code + ".svg"))
        self.once("flag" + code, '<clipPath id="c-%s"><circle r="32"/></clipPath><g id="f-%s"><image href="%s" x="-32" y="-32" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#c-%s)"/></g>' % (code, code, uri, code))
        self.add('<g filter="url(#soft)"><circle cx="%s" cy="%s" r="%s" fill="#fff"/></g><use href="#f-%s" transform="translate(%s %s) scale(%s)"/>' % (cx, cy, r + 4, code, cx, cy, r / 32))

    def logo(self, x, y, s, name):
        """A square tile: opaque app icons fill it, transparent marks sit on white with room around them."""
        uri, aspect, bleed = logo_info(name)
        self.once("logo" + name, '<image id="l-%s" href="%s" width="%s" height="100"/>' % (name, uri, 100 * aspect))
        self.once("lc%s" % s, '<clipPath id="lc%s"><rect width="%s" height="%s" rx="%s"/></clipPath>' % (s, s, s, round(s * 0.24)))
        self.add('<g transform="translate(%s %s)"><g filter="url(#soft)"><rect width="%s" height="%s" rx="%s" fill="#fff"/></g>' % (x, y, s, s, round(s * 0.24)))
        if bleed:
            self.add('<g clip-path="url(#lc%s)"><use href="#l-%s" transform="scale(%s)"/></g>' % (s, name, s / 100 / max(1, aspect)))
        else:
            box = s * 0.64
            scale = box / 100 / max(1, aspect)
            w, h = 100 * aspect * scale, 100 * scale
            self.add('<use href="#l-%s" transform="translate(%s %s) scale(%s)"/>' % (name, (s - w) / 2, (s - h) / 2, scale))
        self.add("</g>")

    def railor(self, x, y, size=30):
        lift = round(size * 0.16)
        rh = size * 0.72
        self.once("railor", '<image id="r-mark" href="data:image/png;base64,%s" width="250" height="320" preserveAspectRatio="none"/>' % b64(self._r_png()))
        pill_w = size + lift + 12 + size * 2.45 + 14
        self.add('<g filter="url(#soft)"><rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="#fff"/></g>' % (x - 12, y - 9, pill_w, size + lift + 18, (size + lift + 18) / 2))
        self.rect(x + lift, y + lift, size, size, ORANGE, size * 0.24)
        self.rect(x, y, size, size, BRAND, size * 0.24)
        self.add('<use href="#r-mark" transform="translate(%s %s) scale(%s)"/>' % (x + (size - rh * 250 / 320) / 2, y + (size - rh) / 2, rh / 320))
        self.text(x + size + lift + 9, y + size * 0.73, "Railor", round(size * 0.62, 1), 800, INK, ls=-0.5)

    @staticmethod
    def _r_png():
        im = Image.open(os.path.join(PUBLIC, "brand", "railor-r.png")).convert("RGBA")
        im.thumbnail((100, 128), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
        return buf.getvalue()

    def bank(self, cx, cy, s=60, color=INK):
        self.add('<path d="M%s %s L%s %s H%s Z" fill="%s"/>' % (cx, cy - s / 2, cx - s * 0.52, cy - s * 0.2, cx + s * 0.52, color))
        for k in range(4):
            self.rect(cx - s * 0.4 + k * s * 0.23, cy - s * 0.12, s * 0.12, s * 0.4, color, 2)
        self.rect(cx - s * 0.5, cy + s * 0.36, s, s * 0.12, color, 3)

    def arc(self, x1, y1, qx, qy, x2, y2, color=ORANGE, width=3):
        self.add('<path d="M%s %s Q%s %s %s %s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-dasharray="1 9"/>' % (x1, y1, qx, qy, x2, y2, color, width))

    @staticmethod
    def bez(t, p0, p1, p2):
        return tuple((1 - t) ** 2 * p0[i] + 2 * (1 - t) * t * p1[i] + t * t * p2[i] for i in range(2))

    def svg(self, slug):
        a, b = self.bg
        head = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d"><title>%s</title><defs>'
            '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>'
            '<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#151310" opacity=".07"/></pattern>'
            '<filter id="lift" x="-20%%" y="-20%%" width="140%%" height="170%%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#3a2410" flood-opacity=".16"/><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#3a2410" flood-opacity=".08"/></filter>'
            '<filter id="soft" x="-30%%" y="-30%%" width="160%%" height="170%%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#3a2410" flood-opacity=".14"/></filter>'
            '<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#f2c14e"/><stop offset="1" stop-color="#c8901c"/></linearGradient>'
            '<linearGradient id="silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#d9dee6"/><stop offset="1" stop-color="#a7b0bd"/></linearGradient>'
            '<linearGradient id="orangeFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a5c"/><stop offset="1" stop-color="#c2410c"/></linearGradient>'
            % (W, H, W, H, esc(slug.replace("-", " ")), a, b)
        )
        body = '</defs><rect width="%d" height="%d" fill="url(#bg)"/><rect width="%d" height="%d" fill="url(#dots)"/><ellipse cx="600" cy="230" rx="520" ry="200" fill="url(#glow)" opacity=".55"/>' % (W, H, W, H)
        return head + "".join(self.defs) + body + "".join(self.out) + "</svg>\n"


# ---- scenes -----------------------------------------------------------------------------------------------------

def phone(c, x, y, w, h):
    c.add('<g filter="url(#lift)"><rect x="%s" y="%s" width="%s" height="%s" rx="34" fill="#151310"/></g>' % (x, y, w, h))
    c.rect(x + 8, y + 8, w - 16, h - 16, "#fffdf9", 27)
    c.rect(x + w / 2 - 30, y + 14, 60, 8, "#151310", 4)


def field(c, x, y, w, label, currency, value=None):
    c.rect(x, y, w, 60, "#f7f0e4", 14)
    c.text(x + 12, y + 20, label, 11, 600, MUTED)
    if value:
        c.text(x + 12, y + 46, value, 22, 800, INK)
    else:
        c.skel(x + 12, y + 34, w * 0.42, 14, "#e5d9c6")
    c.rect(x + w - 58, y + 18, 46, 26, "#fff", 13)
    c.text(x + w - 35, y + 36, currency, 12, 800, INK, "middle")


def scene_how(c):
    phone(c, 150, 76, 190, 336)
    field(c, 168, 140, 154, "You send", "USD", "1,000")
    field(c, 168, 212, 154, "They receive", "INR")
    c.rect(168, 296, 154, 42, ORANGE, 21)
    c.text(245, 323, "Compare", 16, 800, "#fff", "middle")
    c.skel(184, 360, 90, 8)
    p0, p1, p2 = (390, 190), (560, 24), (740, 190)
    c.arc(*p0, *p1, *p2)
    for t, n, label in ((0.1, "1", "Compare"), (0.5, "2", "Pay"), (0.9, "3", "Track")):
        x, y = c.bez(t, p0, p1, p2)
        c.add('<g filter="url(#soft)"><circle cx="%s" cy="%s" r="17" fill="#151310"/></g>' % (x, y))
        c.text(x, y + 6, n, 16, 800, "#fff", "middle")
        c.text(x, y + 40, label, 14, 700, "#3d3832", "middle")
    c.text(560, 268, "Services compared on one screen", 14, 600, MUTED, "middle")
    for i, name in enumerate(("wise", "remitly", "western-union", "payoneer")):
        c.logo(412 + i * 84, 286, 64, name)
    c.card(820, 170, 240, 190, 24)
    c.bank(940, 236, 66)
    c.pill(940, 290, "Arrived", GREEN_BG, GREEN, 13, 28, 14, "middle")
    c.skel(868, 334, 144, 8)
    c.coin(1100, 100, 38, "$", "gold", 12)
    c.coin(1030, 150, 28, "₹", "silver", -10)
    c.flag(1100, 360, 26, "IN")
    c.flag(880, 112, 24, "US")


def scene_cost(c):
    c.add('<g filter="url(#lift)"><path d="M170 76 H520 V372 l-25 18 -25 -18 -25 18 -25 -18 -25 18 -25 -18 -25 18 -25 -18 -25 18 -25 -18 -25 18 -25 -18 -25 18 -25 -18 Z" fill="#fff"/></g>')
    c.text(200, 122, "Transfer summary", 20, 800)
    c.rect(200, 138, 290, 2, LINE)
    for i, (label, w) in enumerate((("You send", 80), ("Transfer fee", 40), ("Exchange rate", 100))):
        y = 178 + i * 50
        c.text(200, y, label, 16, 500, MUTED)
        c.skel(490 - w, y - 12, w, 14, "#e5d9c6")
    c.pill(200, 232, "“No fee”", GREEN_BG, GREEN, 13, 27)
    c.rect(196, 312, 298, 36, "#fff1e7", 9)
    c.text(206, 336, "Markup hidden in the rate", 14, 700, ORANGE_DEEP)
    c.card(620, 120, 440, 210, 22)
    c.text(650, 166, "What it really costs", 19, 800)
    c.text(650, 196, "Measured against the mid-market rate", 14, 500, MUTED)
    c.rect(650, 222, 380, 26, "#f3ebe0", 13)
    c.rect(650, 222, 70, 26, INK, 13)
    c.rect(706, 222, 174, 26, "url(#orangeFill)")
    c.rect(866, 222, 20, 26, ORANGE_DEEP, 13)
    c.add('<circle cx="664" cy="282" r="7" fill="%s"/><circle cx="744" cy="282" r="7" fill="%s"/>' % (INK, ORANGE))
    c.text(678, 288, "Fee", 14, 600, "#3d3832")
    c.text(758, 288, "Exchange-rate markup", 14, 600, "#3d3832")
    c.add('<g filter="url(#soft)"><circle cx="560" cy="300" r="62" fill="#fff" opacity=".35" stroke="#151310" stroke-width="12"/><path d="M604 344 L650 392" stroke="#151310" stroke-width="18" stroke-linecap="round"/></g>')
    c.coin(1110, 84, 38, "%", "gold", 12)
    c.coin(1080, 370, 30, "$", "gold", -8)
    c.coin(1010, 394, 22, "₹", "silver", 6)


def scene_india_in(c):
    c.flag(190, 150, 50, "US")
    c.flag(1010, 150, 50, "IN")
    c.arc(250, 140, 600, 20, 950, 140)
    c.coin(120, 300, 44, "$", "gold", -10)
    c.coin(1090, 300, 40, "₹", "silver", 9)
    c.card(400, 130, 400, 220, 24)
    c.text(430, 178, "Recipient gets", 15, 600, MUTED)
    c.skel(430, 192, 190, 30, "#e5d9c6")
    c.text(770, 214, "INR", 16, 800, INK, "end")
    x = 430
    for label, bg, fg in (("Bank", BLUE_BG, BLUE), ("UPI", GREEN_BG, GREEN), ("Cash pickup", AMBER_BG, AMBER)):
        x += c.pill(x, 250, label, bg, fg, 13, 28) + 8
    c.logo(430, 292, 40, "icici")
    c.skel(482, 300, 120, 9)
    c.skel(482, 318, 80, 9)


def scene_methods(c):
    cards = ((130, "Bank transfer", "Usually cheapest", GREEN_BG, GREEN, "bank"), (480, "Debit card", "Fast", BLUE_BG, BLUE, "debit"), (830, "Credit card", "Extra fees likely", "#fde4d9", ORANGE_DEEP, "credit"))
    for x, title, tag, bg, fg, kind in cards:
        c.card(x, 110, 240, 230, 24)
        if kind == "bank":
            c.bank(x + 120, 190, 70)
        else:
            dark = kind == "credit"
            c.rect(x + 60, 150, 120, 76, "#1c1a17" if dark else BLUE, 11)
            c.rect(x + 72, 168, 24, 17, "#f2c14e", 4)
            for k in range(4):
                c.rect(x + 74 + k * 24, 202, 18, 6, "#ffffff", 3, ' opacity=".7"')
        c.text(x + 120, 276, title, 19, 800, INK, "middle")
        c.pill(x + 120, 292, tag, bg, fg, 13, 28, 14, "middle")
    c.coin(1100, 80, 36, "$", "gold", 10)
    c.coin(90, 380, 30, "₹", "silver", -8)
    c.flag(1100, 380, 24, "US")


def scene_iban(c):
    c.card(300, 82, 420, 286, 22)
    c.text(330, 122, "Recipient’s bank details", 17, 800)
    rows = (("IBAN", "DE89 3704 0044 0532 0130 00", True), ("SWIFT / BIC", "COBADEFFXXX", False), ("Sort code", "20-00-00", False), ("IFSC", "ABCD0123456", False), ("Routing no.", "123456780", False))
    for i, (label, value, hot) in enumerate(rows):
        y = 170 + i * 42
        if hot:
            c.rect(316, y - 24, 388, 36, "#fff1e7", 9)
        c.text(330, y, label, 13, 700, ORANGE_DEEP if hot else MUTED)
        c.text(690, y, value, 13, 700, INK, "end", 0, MONO)
    c.add('<g filter="url(#lift)"><circle cx="840" cy="230" r="72" fill="#fff"/></g><circle cx="840" cy="230" r="58" fill="none" stroke="#1f8a4c" stroke-width="8"/>')
    c.add('<path d="M810 232 l22 22 l44 -50" fill="none" stroke="#1f8a4c" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>')
    c.text(840, 330, "Right details, first time", 14, 700, GREEN, "middle")
    c.flag(960, 130, 28, "DE")
    c.flag(1010, 230, 28, "IN")
    c.flag(960, 330, 28, "GB")
    c.flag(150, 160, 30, "US")


def ranking_card(c, x, y, w, title, rows=5):
    c.card(x, y, w, 270, 22)
    c.text(x + 26, y + 44, title, 17, 800)
    c.pill(x + w - 78, y + 24, "Live", GREEN_BG, GREEN, 12, 26)
    for i in range(rows):
        ry = y + 74 + i * 38
        c.add('<circle cx="%s" cy="%s" r="11" fill="%s"/>' % (x + 38, ry + 9, ORANGE if i == 0 else "#e6dccd"))
        c.text(x + 38, ry + 14, str(i + 1), 12, 800, "#fff" if i == 0 else MUTED, "middle")
        c.rect(x + 62, ry, (w - 100) * (1 - i * 0.11), 18, "url(#orangeFill)" if i == 0 else "#dfe7f4", 9)


def scene_usd(c):
    ranking_card(c, 150, 86, 440, "USD → INR, ranked")
    c.add('<g filter="url(#soft)"><path d="M668 140 h64 v34 a32 32 0 0 1 -64 0 Z" fill="url(#gold)"/><rect x="690" y="206" width="20" height="40" fill="#c8901c"/><rect x="672" y="244" width="56" height="14" rx="5" fill="#151310"/></g>')
    c.text(700, 170, "1", 30, 800, "#8a5a06", "middle")
    c.flag(640, 316, 22, "US")
    c.flag(760, 316, 22, "IN")
    c.card(820, 96, 270, 250, 22)
    c.text(955, 130, "Services Railor checks", 14, 700, MUTED, "middle")
    names = ("wise", "remitly", "xoom", "western-union", "moneygram", "revolut", "worldremit", "nium", "airwallex", "payoneer")
    for i, name in enumerate(names):
        c.logo(842 + (i % 5) * 46, 150 + (i // 5) * 80, 38, name)
    c.skel(850, 308, 214, 9)
    c.coin(1120, 380, 30, "₹", "silver", 8)
    c.coin(90, 380, 30, "$", "gold", -8)


def scene_best(c):
    c.card(250, 84, 700, 272, 26)
    c.text(290, 134, "Money transfer services", 22, 800)
    c.text(290, 160, "Compared for your route, from today’s prices", 14, 500, MUTED)
    c.pill(840, 112, "Live", GREEN_BG, GREEN, 13, 28)
    names = ("wise", "remitly", "xoom", "western-union", "moneygram", "revolut", "worldremit", "nium", "payoneer", "pingpong")
    for i, name in enumerate(names):
        c.logo(290 + (i % 5) * 126, 182 + (i // 5) * 84, 62, name)
    c.coin(130, 130, 42, "$", "gold", -10)
    c.coin(90, 280, 32, "£", "silver", 8)
    c.coin(1080, 130, 40, "€", "silver", 10)
    c.coin(1100, 290, 36, "₹", "gold", -8)
    c.flag(160, 372, 24, "US")
    c.flag(1040, 372, 24, "GB")


# key -> (flag, currency symbol, card title, bank-detail fields, local ways to pay in, background tint)
ROUTES = {
    "us": ("US", "$", "Pay into a US account", ("Account number", "Routing number", "Bank name"), ("ACH", "Wire"), ("#e9eefa", "#d3dcf1")),
    "uk": ("GB", "£", "Pay into a UK account", ("Sort code", "Account number", "Account name"), ("Faster Payments", "Bank transfer"), ("#f8e6e8", "#eccbd1")),
    "ca": ("CA", "$", "Pay into a Canadian account", ("Transit number", "Institution number", "Account number"), ("Interac e-Transfer", "EFT"), ("#fbe6e0", "#f3c9bf")),
    "au": ("AU", "$", "Pay into an Australian account", ("BSB", "Account number", "Account name"), ("PayID", "Bank transfer"), ("#e2eff6", "#c9dfec")),
    "ae": ("AE", "AED", "Pay into a UAE account", ("IBAN", "SWIFT / BIC", "Account name"), ("IBAN transfer", "Bank transfer"), ("#e4f1e7", "#cde3d3")),
    "sg": ("SG", "$", "Pay into a Singapore account", ("Bank code", "Account number", "Account name"), ("PayNow", "FAST"), ("#fbe5e6", "#f2cbcd")),
}


def scene_route(c, key):
    code, sym, title, fields, rails, _ = ROUTES[key]
    c.flag(180, 170, 52, "IN")
    c.flag(1020, 170, 52, code)
    c.arc(240, 160, 600, 20, 960, 160)
    c.coin(130, 330, 42, "₹", "silver", -9)
    c.coin(1080, 330, 44, sym, "gold", 9)
    c.card(390, 100, 420, 250, 24)
    c.text(420, 146, title, 18, 800)
    c.rect(420, 160, 360, 2, LINE)
    for i, label in enumerate(fields):
        y = 192 + i * 40
        c.text(420, y, label, 14, 600, MUTED)
        c.skel(600, y - 12, 150 - i * 12, 14, "#e5d9c6")
    c.pill(420, 306, "Right details, first time", GREEN_BG, GREEN, 12, 28)
    x = 600 - sum(round(len(label) * 13 * 0.6 + 26) + 8 for label in rails) / 2 + 4
    for label in rails:
        x += c.pill(x, 372, label, "#fff", INK, 13, 30) + 8


def scene_app(c):
    phone(c, 440, 62, 320, 350)
    c.text(600, 126, "Which app suits you?", 17, 800, INK, "middle")
    for i, label in enumerate(("Total cost, not just the fee", "Exchange rate against mid-market", "Speed to the bank account", "Limits and paperwork")):
        y = 152 + i * 58
        c.rect(462, y, 276, 46, "#f7f0e4", 13)
        c.check(488, y + 23, 11, GREEN if i < 2 else "#c9bda9")
        c.text(512, y + 28, label, 13, 600, "#3d3832")
    for i, name in enumerate(("wise", "remitly", "sendwave")):
        c.logo(240 + (i % 2) * 90, 96 + i * 92, 66, name)
    for i, name in enumerate(("xoom", "pingpong", "western-union")):
        c.logo(814 + (i % 2) * 90, 96 + i * 92, 66, name)
    c.flag(130, 380, 34, "IN")
    c.coin(1080, 380, 34, "₹", "silver", 9)
    c.coin(1120, 70, 28, "$", "gold", -9)


def scene_cheapest(c):
    c.card(170, 84, 480, 272, 24)
    c.text(204, 132, "Where the cost hides", 20, 800)
    parts = (("Transfer fee", INK, 0.22), ("Exchange-rate markup", ORANGE, 0.56), ("Bank charges", BLUE, 0.14), ("Tax at source", AMBER, 0.08))
    x = 204
    for _, color, share in parts:
        c.rect(x, 158, 412 * share - 3, 28, color, 6)
        x += 412 * share
    for i, (label, color, _) in enumerate(parts):
        y = 232 + i * 31
        c.add('<circle cx="212" cy="%s" r="7" fill="%s"/>' % (y - 5, color))
        c.text(230, y, label, 15, 600, "#3d3832")
        c.skel(520, y - 13, 100 - i * 14, 12, "#e5d9c6")
    c.add('<g filter="url(#soft)"><circle cx="760" cy="250" r="70" fill="#fff" opacity=".4" stroke="#151310" stroke-width="12"/><path d="M810 300 L858 350" stroke="#151310" stroke-width="18" stroke-linecap="round"/></g>')
    c.flag(940, 110, 30, "US")
    c.flag(1040, 170, 30, "GB")
    c.flag(960, 250, 30, "CA")
    c.flag(1060, 310, 30, "AU")
    c.coin(120, 150, 40, "₹", "silver", -10)
    c.coin(1100, 400, 26, "$", "gold", 8)


def scene_lrs(c):
    c.add('<g transform="rotate(-6 250 230)" filter="url(#lift)"><rect x="110" y="136" width="270" height="170" rx="18" fill="#fff"/></g>')
    c.add('<g transform="rotate(-6 250 230)"><rect x="110" y="136" width="270" height="40" rx="18" fill="#dfeafb"/><rect x="110" y="158" width="270" height="18" fill="#dfeafb"/>')
    c.text(130, 164, "PAN", 15, 800, BLUE)
    c.rect(130, 196, 68, 84, "#ece3d4", 10)
    c.skel(216, 200, 140, 12, "#e5d9c6")
    c.skel(216, 226, 110, 12, "#e5d9c6")
    c.skel(216, 252, 150, 12, "#e5d9c6")
    c.add("</g>")
    c.card(450, 96, 360, 250, 24)
    c.text(480, 142, "LRS limit", 19, 800)
    c.text(480, 168, "For each resident, every financial year", 13, 500, MUTED)
    c.rect(480, 206, 300, 22, "#f3ebe0", 11)
    c.rect(480, 206, 190, 22, "url(#orangeFill)", 11)
    c.text(480, 266, "USD 250,000", 30, 800, INK)
    c.pill(480, 286, "Form A2 · purpose code", AMBER_BG, AMBER, 12, 28)
    c.card(870, 120, 190, 200, 22)
    c.add('<circle cx="965" cy="196" r="44" fill="#fff1e7"/>')
    c.text(965, 208, "TCS", 30, 800, ORANGE_DEEP, "middle")
    c.text(965, 270, "Tax collected", 14, 700, INK, "middle")
    c.text(965, 290, "at source", 14, 700, INK, "middle")
    c.flag(120, 372, 28, "IN")
    c.coin(1110, 380, 32, "₹", "silver", 9)


def scene_receive(c):
    for i, code in enumerate(("US", "GB", "DE")):
        c.flag(150, 140 + i * 90, 32, code)
        c.arc(190, 140 + i * 90, 290, 140 + i * 40, 380, 230)
    c.card(400, 90, 400, 260, 24)
    c.text(430, 136, "Ways to get paid", 18, 800)
    for i, name in enumerate(("payoneer", "paypal", "wise", "airwallex")):
        c.logo(430 + i * 86, 156, 64, name)
    c.rect(430, 240, 340, 2, LINE)
    c.bank(462, 290, 44)
    c.text(500, 286, "Credited in rupees", 15, 800)
    c.pill(500, 298, "Received", GREEN_BG, GREEN, 12, 26)
    c.flag(900, 200, 56, "IN")
    c.coin(1060, 120, 40, "₹", "silver", -9)
    c.coin(1050, 320, 36, "$", "gold", 9)


def scene_study(c):
    c.card(330, 110, 380, 240, 24)
    c.text(360, 156, "Tuition invoice", 18, 800)
    c.rect(360, 170, 320, 2, LINE)
    for i, w in enumerate((200, 150, 180)):
        c.skel(360, 196 + i * 30, w, 12, "#e5d9c6")
        c.skel(620, 196 + i * 30, 60, 12, "#e5d9c6")
    c.rect(360, 296, 150, 40, ORANGE, 20)
    c.text(435, 322, "Pay fees", 15, 800, "#fff", "middle")
    c.add('<g filter="url(#lift)"><path d="M820 130 L920 90 L1020 130 L920 170 Z" fill="#151310"/><path d="M860 154 v44 q60 34 120 0 v-44 L920 176 Z" fill="#2b2824"/><path d="M1010 134 v54" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/><circle cx="1010" cy="194" r="9" fill="#f2c14e"/></g>')
    for i, code in enumerate(("GB", "US", "CA", "AU")):
        c.flag(830 + i * 62, 290, 24, code)
    c.coin(150, 150, 40, "₹", "silver", -10)
    c.coin(130, 310, 34, "£", "gold", 8)
    c.coin(1090, 380, 30, "$", "gold", -6)


def scene_swift(c):
    nodes = ((190, "Your bank", "IN"), (600, "Intermediary bank", None), (1010, "Recipient’s bank", "US"))
    for x, label, code in nodes:
        c.card(x - 90, 90, 180, 150, 22)
        c.bank(x, 150, 56, INK)
        c.text(x, 218, label, 14, 700, INK, "middle")
        if code:
            c.flag(x + 78, 98, 20, code)
    c.arc(285, 165, 395, 140, 505, 165)
    c.arc(695, 165, 805, 140, 915, 165)
    for x, tag, sub, bg, fg in ((290, "OUR", "You pay all charges", GREEN_BG, GREEN), (600, "SHA", "Charges are shared", AMBER_BG, AMBER), (910, "BEN", "Recipient pays charges", "#fde4d9", ORANGE_DEEP)):
        c.card(x - 120, 272, 240, 100, 20)
        c.pill(x, 288, tag, bg, fg, 15, 30, 18, "middle")
        c.text(x, 346, sub, 14, 600, "#3d3832", "middle")
    c.coin(80, 400, 28, "$", "gold", -9)
    c.coin(1120, 400, 28, "€", "silver", 9)


def scene_safe(c):
    c.add('<g filter="url(#lift)"><path d="M240 90 L350 130 V230 C350 300 300 340 240 366 C180 340 130 300 130 230 V130 Z" fill="#fff"/></g><path d="M240 112 L330 146 V230 C330 288 288 320 240 342 C192 320 150 288 150 230 V146 Z" fill="#dcf3e4"/>')
    c.add('<path d="M196 232 l32 32 l62 -72" fill="none" stroke="#1f8a4c" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>')
    c.card(450, 96, 420, 250, 24)
    c.text(480, 142, "Before you send", 19, 800)
    for i, label in enumerate(("Authorised to move money", "Fees shown before you pay", "Secure, regulated payment", "Clear contact details")):
        y = 178 + i * 40
        c.check(492, y, 12, GREEN)
        c.text(516, y + 6, label, 15, 600, "#3d3832")
    c.add('<g filter="url(#lift)"><path d="M990 150 L1062 276 H918 Z" fill="#f2c14e"/></g><path d="M990 190 v44" stroke="#8a5a06" stroke-width="10" stroke-linecap="round"/><circle cx="990" cy="256" r="6" fill="#8a5a06"/>')
    c.text(990, 312, "Too good to be true?", 13, 700, AMBER, "middle")
    c.flag(120, 390, 26, "IN")
    c.coin(1110, 390, 30, "₹", "silver", 8)


def scene_nre(c):
    cards = ((130, "NRE account", "Money from abroad", BLUE_BG, BLUE), (450, "NRO account", "Income earned in India", AMBER_BG, AMBER), (770, "Resident account", "For people living in India", GREEN_BG, GREEN))
    for x, title, tag, bg, fg in cards:
        c.card(x, 120, 270, 220, 24)
        c.bank(x + 56, 186, 54, INK)
        c.text(x + 100, 182, title, 17, 800)
        c.pill(x + 24, 232, tag, bg, fg, 12, 28)
        c.skel(x + 24, 282, 190, 9)
        c.skel(x + 24, 302, 120, 9)
    c.logo(130 + 270 - 58, 132, 38, "icici")
    c.flag(130, 390, 26, "US")
    c.flag(1120, 390, 26, "IN")
    c.coin(70, 250, 24, "$", "gold", -8)
    c.coin(1130, 250, 24, "₹", "silver", 8)


COVERS = {
    "how-to-send-money-abroad": ("getting", scene_how),
    "real-cost-of-sending-money": ("getting", scene_cost),
    "send-money-to-india": ("getting", scene_india_in),
    "debit-card-vs-bank-transfer": ("ways", scene_methods),
    "iban-swift-bic-explained": ("bank", scene_iban),
    "usd-to-inr": ("rates", scene_usd),
    "best-money-transfer-services": ("rates", scene_best),
    "send-money-from-india-to-usa": ("india", lambda c: scene_route(c, "us")),
    "send-money-from-india-to-uk": ("india", lambda c: scene_route(c, "uk")),
    "send-money-from-india-to-canada": ("india", lambda c: scene_route(c, "ca")),
    "send-money-from-india-to-australia": ("india", lambda c: scene_route(c, "au")),
    "send-money-from-india-to-uae": ("india", lambda c: scene_route(c, "ae")),
    "send-money-from-india-to-singapore": ("india", lambda c: scene_route(c, "sg")),
    "best-money-transfer-app-in-india": ("india", scene_app),
    "cheapest-way-to-send-money-abroad-from-india": ("india", scene_cheapest),
    "lrs-limit-and-tcs-explained": ("india", scene_lrs),
    "receive-money-from-abroad-in-india": ("india", scene_receive),
    "send-money-abroad-for-study-from-india": ("india", scene_study),
    "swift-charges-our-sha-ben-explained": ("bank", scene_swift),
    "is-this-money-transfer-service-safe-in-india": ("india", scene_safe),
    "send-money-to-india-nre-nro-accounts": ("india", scene_nre),
}


def route_bg(slug):
    for key, spec in ROUTES.items():
        if slug.endswith("-" + {"us": "usa", "uk": "uk", "ca": "canada", "au": "australia", "ae": "uae", "sg": "singapore"}[key]) and slug.startswith("send-money-from-india-to-"):
            return spec[5]
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    for slug, (topic, scene) in COVERS.items():
        c = Cover(topic, route_bg(slug))
        scene(c)
        c.railor(40, 26, 30)
        path = os.path.join(OUT, slug + ".svg")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(c.svg(slug))
        print("%-48s %5.1f KB" % (slug, os.path.getsize(path) / 1024))


if __name__ == "__main__":
    main()

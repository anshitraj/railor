"""
Renders the landing page's background videos (public/video/*.mp4 plus a poster
.jpg for each). Everything is drawn here from data already in the repo:

  hero-globe      a dotted Earth (Natural Earth 1:110m land, public domain, from
                  components/app/world-land-paths.ts) seen from above Europe and
                  Africa, swaying slowly, with money travelling along corridors
                  and a soft ring where each one lands. Light, warm, quiet.
  hero-globe-m    the same scene framed for a phone held upright.
  rails           a dark band of rails with light moving along them, for the
                  routes section and the closing call to action.

Each video is a seamless loop: every moving part repeats a whole number of
times inside the loop, and the globe sways instead of spinning.

    python apps/web/lib/media/generate-videos.py [name ...]

Needs Pillow, numpy and ffmpeg on PATH.
"""
import math
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(WEB, "public", "video")
LAND_TS = os.path.join(WEB, "components", "app", "world-land-paths.ts")
FPS = 30

# ---- land mask -------------------------------------------------------------------------------------------------

MAP_W, MAP_H, LAT_TOP, LAT_BOTTOM = 1000, 500, 83.0, -56.0
MASK_W, MASK_H = 2880, 1440  # 0.125 degree per pixel


def land_mask():
    with open(LAND_TS, encoding="utf-8") as fh:
        source = fh.read()
    paths = re.findall(r'"(M[^"]+)"', source)
    mask = Image.new("L", (MASK_W, MASK_H), 0)
    draw = ImageDraw.Draw(mask)
    for path in paths:
        for ring in path.split("Z"):
            nums = re.findall(r"-?\d+(?:\.\d+)?", ring)
            if len(nums) < 6:
                continue
            pts = []
            for i in range(0, len(nums) - 1, 2):
                x, y = float(nums[i]), float(nums[i + 1])
                lon = x / MAP_W * 360 - 180
                lat = LAT_TOP - y / MAP_H * (LAT_TOP - LAT_BOTTOM)
                pts.append(((lon + 180) / 360 * MASK_W, (90 - lat) / 180 * MASK_H))
            draw.polygon(pts, fill=255)
    return np.array(mask) > 0


def land_points(mask, step=1.45):
    """Dots on a latitude grid whose spacing shrinks toward the poles, so they sit evenly on the sphere."""
    lats, lons = [], []
    lat = -60.0
    while lat <= 80:
        ring = max(1, int(round(360 * math.cos(math.radians(lat)) / step)))
        for k in range(ring):
            lon = -180 + (k + 0.5) * 360 / ring
            px = int((lon + 180) / 360 * MASK_W) % MASK_W
            py = min(MASK_H - 1, int((90 - lat) / 180 * MASK_H))
            if mask[py, px]:
                lats.append(lat)
                lons.append(lon)
        lat += step
    return np.radians(np.array(lats)), np.radians(np.array(lons))


def to_xyz(lat, lon):
    return np.stack([np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)], axis=-1)


def rotation(center_lon, center_lat):
    """Rotates the globe so (center_lat, center_lon) faces the viewer."""
    a, b = math.radians(center_lon), math.radians(center_lat)
    ry = np.array([[math.cos(-a), 0, math.sin(-a)], [0, 1, 0], [-math.sin(-a), 0, math.cos(-a)]])
    rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    return rx @ ry


def slerp(p, q, t):
    omega = math.acos(max(-1.0, min(1.0, float(np.dot(p, q)))))
    if omega < 1e-6:
        return p
    return (math.sin((1 - t) * omega) * p + math.sin(t * omega) * q) / math.sin(omega)


CITIES = {
    "NYC": (40.7, -74.0), "LON": (51.5, -0.1), "BOM": (19.1, 72.9), "DEL": (28.6, 77.2), "DXB": (25.2, 55.3),
    "LOS": (6.5, 3.4), "NBO": (-1.3, 36.8), "FRA": (50.1, 8.7), "SAO": (-23.5, -46.6), "LIS": (38.7, -9.1),
    "TOR": (43.7, -79.4), "SIN": (1.35, 103.8), "IST": (41.0, 29.0), "CAI": (30.0, 31.2), "JNB": (-26.2, 28.0),
}
ROUTES = [("NYC", "LON"), ("LON", "BOM"), ("DXB", "DEL"), ("LON", "LOS"), ("FRA", "NBO"), ("SAO", "LIS"),
          ("NYC", "BOM"), ("IST", "DXB"), ("LON", "JNB"), ("TOR", "DEL"), ("CAI", "DXB"), ("LIS", "LOS")]


def lerp_color(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def background(w, h, top, bottom):
    grad = np.linspace(0, 1, h)[:, None, None]
    arr = (np.array(top)[None, None, :] * (1 - grad) + np.array(bottom)[None, None, :] * grad).astype(np.uint8)
    return Image.fromarray(np.repeat(arr, w, axis=1), "RGB")


def globe_frames(width, height, cx, cy, radius, seconds=12, ss=2):
    mask = land_mask()
    lat, lon = land_points(mask)
    base = to_xyz(lat, lon)
    city_xyz = {key: to_xyz(math.radians(la), math.radians(lo)) for key, (la, lo) in CITIES.items()}
    frames = seconds * FPS
    W, H, R, CX, CY = width * ss, height * ss, radius * ss, cx * ss, cy * ss
    bg = background(W, H, (251, 247, 240), (244, 233, 218))
    # a warm glow behind the planet
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([CX - R * 1.35, CY - R * 1.35, CX + R * 1.35, CY + R * 1.35], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(R * 0.35))
    bg = Image.composite(Image.new("RGB", (W, H), (250, 214, 182)), bg, glow.point(lambda v: int(v * 0.55)))
    # the sphere itself: a pale disc, lit from the upper left
    disc = Image.new("L", (W, H), 0)
    ImageDraw.Draw(disc).ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
    yy, xx = np.mgrid[0:H, 0:W]
    shade = np.clip(1 - (((xx - (CX - R * 0.35)) ** 2 + (yy - (CY - R * 0.45)) ** 2) ** 0.5) / (R * 2.2), 0, 1)
    shade_img = Image.fromarray((np.stack([250 + 5 * shade, 245 + 9 * shade, 237 + 16 * shade], -1)).clip(0, 255).astype(np.uint8), "RGB")
    bg = Image.composite(shade_img, bg, disc)
    rim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(rim).ellipse([CX - R, CY - R, CX + R, CY + R], outline=(214, 192, 168, 120), width=int(2 * ss))
    bg = bg.convert("RGBA")
    bg.alpha_composite(rim)

    arc_period = frames // 2  # each corridor fires twice per loop
    for f in range(frames):
        t = f / frames
        sway_lon = 12 + 5 * math.sin(2 * math.pi * t)
        sway_lat = 18 + 1.5 * math.sin(2 * math.pi * t + 1.1)
        rot = rotation(sway_lon, sway_lat)
        p = base @ rot.T
        visible = p[:, 2] > 0.02
        px = CX + p[visible, 0] * R
        py = CY - p[visible, 1] * R
        depth = p[visible, 2]
        img = bg.copy()
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for x, y, z in zip(px, py, depth):
            r = (1.0 + 1.15 * z) * ss
            a = int(70 + 150 * z)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(160, 132, 106, a))
        # corridors: a faint path, a bright head travelling along it, and a ring where it lands
        for i, (src, dst) in enumerate(ROUTES):
            a3, b3 = city_xyz[src], city_xyz[dst]
            phase = ((f + i * arc_period // len(ROUTES)) % arc_period) / arc_period
            pts = []
            for k in range(61):
                s = k / 60
                v = slerp(a3, b3, s)
                lift = 1 + 0.16 * math.sin(math.pi * s) * min(1.0, float(np.linalg.norm(a3 - b3)))
                q = (v * lift) @ rot.T
                pts.append((CX + q[0] * R, CY - q[1] * R, q[2]))
            front = [(x, y) for x, y, z in pts if z > -0.05]
            if len(front) > 2:
                d.line(front, fill=(233, 86, 42, 38), width=int(1.4 * ss))
            travel = min(1.0, phase / 0.62)
            if phase < 0.62:
                head = int(travel * 60)
                tail = max(0, head - 14)
                for k in range(tail, head):
                    x0, y0, z0 = pts[k]
                    x1, y1, z1 = pts[k + 1]
                    if z0 > -0.05 and z1 > -0.05:
                        fade = (k - tail + 1) / max(1, head - tail)
                        d.line([(x0, y0), (x1, y1)], fill=(233, 86, 42, int(40 + 215 * fade)), width=int(3 * ss))
                hx, hy, hz = pts[head]
                if hz > -0.05:
                    d.ellipse([hx - 4 * ss, hy - 4 * ss, hx + 4 * ss, hy + 4 * ss], fill=(255, 244, 232, 255), outline=(233, 86, 42, 255), width=int(2 * ss))
            else:
                ring = (phase - 0.62) / 0.38
                ex, ey, ez = pts[-1]
                if ez > -0.05:
                    rr = (5 + 26 * ring) * ss
                    d.ellipse([ex - rr, ey - rr, ex + rr, ey + rr], outline=(233, 86, 42, int(200 * (1 - ring))), width=int(2 * ss))
                    d.ellipse([ex - 4 * ss, ey - 4 * ss, ex + 4 * ss, ey + 4 * ss], fill=(233, 86, 42, int(255 * (1 - ring * 0.6))))
            for key in (src, dst):
                q = city_xyz[key] @ rot.T
                if q[2] > 0:
                    x, y = CX + q[0] * R, CY - q[1] * R
                    d.ellipse([x - 3 * ss, y - 3 * ss, x + 3 * ss, y + 3 * ss], fill=(90, 1, 36, 200))
        img.alpha_composite(layer)
        yield img.convert("RGB").resize((width, height), Image.LANCZOS)


def rails_frames(width, height, seconds=8, ss=2):
    frames = seconds * FPS
    W, H = width * ss, height * ss
    bg = background(W, H, (24, 18, 15), (14, 11, 9)).convert("RGBA")
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W * 0.55, -H * 0.3, W * 1.3, H * 0.9], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(H * 0.22))
    bg = Image.composite(Image.new("RGBA", (W, H), (90, 1, 36, 255)), bg, glow.point(lambda v: int(v * 0.6)))
    n = 9

    def rail(i, s):
        """Point on rail i at s in [0, 1]: rails fan out on the left and gather toward the right."""
        spread = (i - (n - 1) / 2) / ((n - 1) / 2)
        x = -0.05 * W + s * 1.1 * W
        y = H * (0.5 + spread * (0.46 - 0.3 * s) + 0.05 * math.sin(s * math.pi * 1.3 + i))
        return x, y

    static = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(static)
    for i in range(n):
        pts = [rail(i, k / 120) for k in range(121)]
        sd.line(pts, fill=(255, 236, 214, 34), width=int(1.4 * ss))
        for k in range(0, 121, 6):
            x, y = pts[k]
            sd.ellipse([x - 1.2 * ss, y - 1.2 * ss, x + 1.2 * ss, y + 1.2 * ss], fill=(255, 236, 214, 40))
    bg.alpha_composite(static)
    packets = [(i, j) for i in range(n) for j in range(2)]
    for f in range(frames):
        t = f / frames
        img = bg.copy()
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for i, j in packets:
            laps = 1 + (i + j) % 2  # each packet crosses once or twice per loop
            s = (t * laps + (i * 0.137 + j * 0.5)) % 1.0
            color = (233, 86, 42) if (i + j) % 3 else (255, 226, 196)
            # a tapered streak: bright and thick at the head, fading to nothing behind it
            for k in range(28):
                s0, s1 = s - k * 0.0045, s - (k + 1) * 0.0045
                if s1 < 0:
                    break
                fade = (1 - k / 28) ** 1.5
                d.line([rail(i, s0), rail(i, s1)], fill=color + (int(235 * fade),), width=max(1, int((3.4 * fade + 0.6) * ss)))
            hx, hy = rail(i, s)
            d.ellipse([hx - 3.4 * ss, hy - 3.4 * ss, hx + 3.4 * ss, hy + 3.4 * ss], fill=(255, 240, 226, 255))
        blur = layer.filter(ImageFilter.GaussianBlur(7 * ss))
        img.alpha_composite(blur)
        img.alpha_composite(blur)
        img.alpha_composite(layer)
        yield img.convert("RGB").resize((width, height), Image.LANCZOS)


def encode(name, width, height, frames, crf=27):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (width, height), "-r", str(FPS),
           "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    poster = None
    for i, frame in enumerate(frames):
        if i == 0:
            poster = frame
        proc.stdin.write(frame.tobytes())
        if i % 60 == 0:
            print(name, "frame", i, flush=True)
    proc.stdin.close()
    proc.wait()
    poster.save(os.path.join(OUT, name + ".jpg"), quality=82, optimize=True, progressive=True)
    print(name, "%.1f MB" % (os.path.getsize(path) / 1e6), flush=True)


JOBS = {
    "hero-globe": lambda: encode("hero-globe", 1920, 1080, globe_frames(1920, 1080, 1240, 900, 640)),
    "hero-globe-m": lambda: encode("hero-globe-m", 720, 1280, globe_frames(720, 1280, 360, 1120, 470)),
    "rails": lambda: encode("rails", 1920, 1080, rails_frames(1920, 1080)),
}

if __name__ == "__main__":
    for job in sys.argv[1:] or list(JOBS):
        JOBS[job]()

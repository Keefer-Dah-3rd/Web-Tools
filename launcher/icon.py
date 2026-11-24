"""Draws the Mibbit Tools app icon (AppIcon.icns): Mibbit's crimson orb on its dark casing, with
the design tools' sparkle. Run: python3 icon.py (needs Pillow; macOS iconutil builds the .icns)."""
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
S = 1024


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # The casing: a rounded tile in Mibbit's warm near-black, a hairline lighter at the top.
    tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle((80, 80, S - 80, S - 80), radius=190, fill=(36, 30, 30, 255))
    d.rounded_rectangle((80, 80, S - 80, S - 80), radius=190, outline=(80, 70, 67, 255), width=6)
    img.alpha_composite(tile)
    # The orb: a crimson glow, then the body.
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((270, 270, S - 270, S - 270), fill=(170, 0, 23, 200))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(60)))
    orb = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    od.ellipse((322, 322, S - 322, S - 322), fill=(170, 0, 23, 255))
    od.ellipse((370, 350, S - 420, S - 470), fill=(229, 51, 53, 140))
    img.alpha_composite(orb.filter(ImageFilter.GaussianBlur(2)))
    # The sparkle: a four-point star, top right of the orb.
    cx, cy, r_out, r_in = 690, 330, 120, 30
    pts = []
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    star = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(star).polygon(pts, fill=(255, 255, 246, 255))
    halo = star.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(halo)
    img.alpha_composite(star)
    return img


def main() -> None:
    art = draw()
    work = Path(tempfile.mkdtemp())
    iconset = work / "AppIcon.iconset"
    iconset.mkdir()
    for size in (16, 32, 128, 256, 512):
        art.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
        art.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(HERE / "AppIcon.icns")], check=True)
    shutil.rmtree(work)
    print("Wrote", HERE / "AppIcon.icns")


if __name__ == "__main__":
    main()

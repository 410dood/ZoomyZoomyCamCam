# One-time generator for the desktop app icon set (requires Pillow).
from PIL import Image, ImageDraw


def make(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size
    r = s // 5
    # rounded dark-navy plate
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=(13, 17, 23, 255))
    # camera lens: outer ring (accent blue), inner disc, highlight
    c = s // 2
    d.ellipse(
        [c - s * 0.32, c - s * 0.32, c + s * 0.32, c + s * 0.32],
        outline=(47, 129, 247, 255),
        width=max(2, s // 16),
    )
    d.ellipse([c - s * 0.18, c - s * 0.18, c + s * 0.18, c + s * 0.18], fill=(47, 129, 247, 255))
    hx = c - s * 0.07
    d.ellipse([hx - s * 0.04, c - s * 0.11, hx + s * 0.04, c - s * 0.03], fill=(230, 237, 243, 255))
    # recording dot, top-right
    d.ellipse([s * 0.72, s * 0.14, s * 0.86, s * 0.28], fill=(248, 81, 73, 255))
    return img


if __name__ == "__main__":
    import os

    base = os.path.dirname(os.path.abspath(__file__))
    make(512).save(os.path.join(base, "icon.png"))
    make(128).save(os.path.join(base, "128x128.png"))
    make(256).save(os.path.join(base, "128x128@2x.png"))
    make(32).save(os.path.join(base, "32x32.png"))
    make(256).save(
        os.path.join(base, "icon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("icons written")

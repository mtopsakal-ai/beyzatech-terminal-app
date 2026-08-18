from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


NAVY = "#090D16"
PANEL = "#0F172A"
BLUE = "#38BDF8"
YELLOW = "#FBBF24"
PALE = "#FFF7AE"
WHITE = "#FFFFFF"
BRAND_SOURCE = Path("assets/beyzatech-logo-original.png")


def bolt_points(size, offset_x=0, offset_y=0):
    scale = size / 1024
    points = [
        (568, 146), (288, 562), (479, 562),
        (436, 878), (736, 435), (536, 435),
    ]
    return [
        (int(x * scale + offset_x), int(y * scale + offset_y))
        for x, y in points
    ]


def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"
        if bold else
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_icon():
    if BRAND_SOURCE.exists():
        image = Image.open(BRAND_SOURCE).convert("RGB")
        image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
        image.save("assets/icon.png")
        return

    image = Image.new("RGBA", (1024, 1024), NAVY)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, 1023, 1023), radius=224, fill=NAVY)
    draw.ellipse((190, 190, 834, 834), fill=PANEL, outline=BLUE, width=18)
    draw.polygon(bolt_points(1024), fill=YELLOW, outline=PALE)
    image.save("assets/icon.png")


def make_adaptive_icon():
    if BRAND_SOURCE.exists():
        source = Image.open(BRAND_SOURCE).convert("RGBA")
        source = source.resize((820, 820), Image.Resampling.LANCZOS)
        image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        image.alpha_composite(source, ((1024 - 820) // 2, (1024 - 820) // 2))
        image.save("assets/adaptive-icon.png")
        return

    image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(bolt_points(860, offset_x=82, offset_y=74), fill=YELLOW, outline=PALE)
    image.save("assets/adaptive-icon.png")


def make_splash():
    image = Image.new("RGB", (1284, 2778), NAVY)
    draw = ImageDraw.Draw(image)

    if BRAND_SOURCE.exists():
        source = Image.open(BRAND_SOURCE).convert("RGB")
        source = source.resize((620, 620), Image.Resampling.LANCZOS)
        image.paste(source, ((1284 - 620) // 2, 790))
    else:
        draw.ellipse((377, 855, 907, 1385), fill=PANEL, outline=BLUE, width=14)
        draw.polygon(bolt_points(720, offset_x=282, offset_y=655), fill=YELLOW, outline=PALE)

    title_font = font(78, bold=True)
    subtitle_font = font(42, bold=True)
    draw.text((642, 1510), "BEYZATECH", fill=WHITE, font=title_font, anchor="mm")
    draw.text((642, 1610), "TERMINAL", fill=BLUE, font=subtitle_font, anchor="mm")
    image.save("assets/splash.png")


if __name__ == "__main__":
    make_icon()
    make_adaptive_icon()
    make_splash()

"""Validate smoke-test dot placement. Requires Pillow; run separately from timing."""

import json
import math
import sys
from pathlib import Path

from PIL import Image

directory = Path(sys.argv[1] if len(sys.argv) > 1 else "reports/grid-comparison")
checks = json.loads((directory / "visual-checks.json").read_text())
results = []
for trial in checks["trials"]:
    for camera in trial["cameras"]:
        name = f'{trial["candidate"]}-{trial["preference"]}-{camera["name"]}.png'
        image = Image.open(directory / name).convert("RGB")
        pixels = image.load()
        dpr = 2
        spacing = 32 * camera["zoom"]
        while spacing < 20:
            spacing *= 2
        while spacing > 64:
            spacing /= 2
        offset_x, offset_y = camera["x"] % spacing, camera["y"] % spacing
        dark = 0
        for y in range(image.height):
            for x in range(image.width):
                if min(pixels[x, y]) >= 248:
                    continue
                dx = ((x + 0.5) / dpr - offset_x + spacing / 2) % spacing - spacing / 2
                dy = ((y + 0.5) / dpr - offset_y + spacing / 2) % spacing - spacing / 2
                assert math.hypot(dx, dy) < 1.6, (name, "unexpected dark pixel", x, y)
                dark += 1
        dots = 0
        cy = offset_y
        while cy < image.height / dpr - 2:
            cx = offset_x
            while cx < image.width / dpr - 2:
                if cx > 2 and cy > 2:
                    px, py = round(cx * dpr), round(cy * dpr)
                    assert any(
                        min(pixels[x, y]) < 248
                        for y in range(py - 3, py + 4)
                        for x in range(px - 3, px + 4)
                    ), (name, "missing dot", cx, cy)
                    dots += 1
                cx += spacing
            cy += spacing
        assert dark and dots, name
        results.append({
            "image": name,
            "expectedDotsChecked": dots,
            "darkPixels": dark,
            "spacingCssPx": spacing,
            "dpr": dpr,
        })
(directory / "visual-validation.json").write_text(json.dumps(results, indent=2) + "\n")
print(f"Passed dot-placement checks for {len(results)} images")

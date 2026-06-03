#!/usr/bin/env python3
"""Compress Egger decor JPGs in place for web deployment and git."""
from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TEXTURES_DIR = ROOT / "assets" / "egger-textures"
MAX_SIDE = 2048
JPEG_QUALITY = 92


def compress_file(src: Path, force: bool) -> tuple[str, int, int]:
    before = src.stat().st_size
    with Image.open(src) as img:
        img.load()
        w, h = img.size
        scale = min(1.0, MAX_SIDE / max(w, h))
        if scale >= 1.0 and not force:
            return "skip", before, before

        if scale < 1.0:
            nw, nh = int(w * scale), int(h * scale)
            img = img.resize((nw, nh), Image.Resampling.LANCZOS)

        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        with tempfile.NamedTemporaryFile(delete=False, dir=src.parent, suffix=".jpg") as tmp:
            tmp_path = Path(tmp.name)
        img.save(
            tmp_path,
            "JPEG",
            quality=JPEG_QUALITY,
            optimize=True,
            progressive=True,
        )

    after = tmp_path.stat().st_size
    if after >= before and scale >= 1.0:
        tmp_path.unlink(missing_ok=True)
        return "skip", before, before

    tmp_path.replace(src)
    return "ok", before, after


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Recompress even if already <= max side")
    args = parser.parse_args()

    if not TEXTURES_DIR.is_dir():
        print(f"Missing dir: {TEXTURES_DIR}", file=sys.stderr)
        return 1

    files = sorted(TEXTURES_DIR.glob("*.jpg"))
    ok = skip = err = 0
    saved = 0
    for src in files:
        try:
            status, before, after = compress_file(src, args.force)
            if status == "skip":
                skip += 1
            else:
                ok += 1
                saved += max(0, before - after)
        except Exception as exc:  # noqa: BLE001
            err += 1
            print(f"ERR {src.name}: {exc}", file=sys.stderr)

    total_after = sum(f.stat().st_size for f in files)
    print(
        f"done: ok={ok} skip={skip} err={err} "
        f"saved_mb={saved / (1024 * 1024):.1f} total_mb={total_after / (1024 * 1024):.1f}"
    )
    return 0 if err == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

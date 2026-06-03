#!/usr/bin/env python3
"""Build web previews for Egger decor JPGs (3D configurator)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "assets" / "egger-textures"
DST_DIR = ROOT / "assets" / "egger-textures-preview"
MAX_SIDE = 2048
JPEG_QUALITY = 92
SKIP_IF_NEWER = True


def build_preview(src: Path, dst: Path, force: bool) -> tuple[str, int, int]:
    if dst.exists() and not force:
        if SKIP_IF_NEWER and dst.stat().st_mtime >= src.stat().st_mtime:
            return "skip", dst.stat().st_size, 0

    img = Image.open(src)
    img.load()
    w, h = img.size
    scale = min(1.0, MAX_SIDE / max(w, h))
    if scale < 1.0:
        nw, nh = int(w * scale), int(h * scale)
        img = img.resize((nw, nh), Image.Resampling.LANCZOS)

    dst.parent.mkdir(parents=True, exist_ok=True)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.save(dst, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return "ok", dst.stat().st_size, src.stat().st_size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Rebuild even if preview is newer")
    parser.add_argument("--deploy", action="store_true", help="Also copy previews to deploy/assets/")
    args = parser.parse_args()

    if not SRC_DIR.is_dir():
        print(f"Missing source dir: {SRC_DIR}", file=sys.stderr)
        return 1

    files = sorted(SRC_DIR.glob("*.jpg"))
    if not files:
        print("No JPG files found.")
        return 0

    ok = skip = err = 0
    saved = 0
    for src in files:
        dst = DST_DIR / src.name
        try:
            status, dst_bytes, src_bytes = build_preview(src, dst, args.force)
            if status == "skip":
                skip += 1
            else:
                ok += 1
                if src_bytes:
                    saved += max(0, src_bytes - dst_bytes)
        except Exception as exc:  # noqa: BLE001
            err += 1
            print(f"ERR {src.name}: {exc}", file=sys.stderr)

    print(f"done: ok={ok} skip={skip} err={err} saved_mb={saved / (1024 * 1024):.1f}")

    if args.deploy:
        deploy_dst = ROOT / "deploy" / "assets" / "egger-textures-preview"
        deploy_dst.mkdir(parents=True, exist_ok=True)
        import shutil

        for f in DST_DIR.glob("*.jpg"):
            shutil.copy2(f, deploy_dst / f.name)
        print(f"deploy copy -> {deploy_dst}")

    return 0 if err == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

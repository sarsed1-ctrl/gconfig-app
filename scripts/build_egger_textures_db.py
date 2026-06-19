import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "assets" / "eamf-catalog.json"
TEXTURES_DIR = ROOT / "assets" / "egger-textures"
PREVIEW_DIR = ROOT / "assets" / "egger-textures-preview"
FAILED_PATH = ROOT / "assets" / "egger-textures-failed.txt"
OUT_PATH = ROOT / "assets" / "egger-textures-db.json"
DEPLOY_OUT_PATH = ROOT / "deploy" / "assets" / "egger-textures-db.json"


def load_catalog_codes(catalog_path: Path) -> list[str]:
    data = json.loads(catalog_path.read_text(encoding="utf-8"))
    codes: set[str] = set()
    for key in ("materials", "countertops"):
        rows = data.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            decor = str(row.get("decor") or "").strip().upper()
            if re.fullmatch(r"[A-Z]\d{3,4}", decor):
                codes.add(decor)
    return sorted(codes)


def load_failed_map(failed_path: Path) -> dict[str, str]:
    if not failed_path.exists():
        return {}
    failed_map: dict[str, str] = {}
    for raw in failed_path.read_text(encoding="utf-8").splitlines():
        row = raw.strip()
        if not row:
            continue
        if "|" in row:
            code, reason = row.split("|", 1)
            failed_map[code.strip().upper()] = reason.strip()
        else:
            failed_map[row.upper()] = "failed"
    return failed_map


def build_texture_records(
    codes: list[str], textures_dir: Path, preview_dir: Path
) -> tuple[dict[str, dict], list[str]]:
    records: dict[str, dict] = {}
    missing: list[str] = []
    for code in codes:
        file_path = textures_dir / f"{code}.jpg"
        preview_path = preview_dir / f"{code}.jpg"
        if file_path.exists():
            rel = file_path.relative_to(ROOT).as_posix()
            preview_rel = (
                preview_path.relative_to(ROOT).as_posix() if preview_path.exists() else ""
            )
            record = {
                "decor": code,
                "file": file_path.name,
                "path": rel,
                "url": f"/{rel}",
                "bytes": file_path.stat().st_size,
            }
            if preview_rel:
                record["previewPath"] = preview_rel
                record["previewUrl"] = f"/{preview_rel}"
            records[code] = record
        elif preview_path.exists():
            rel = preview_path.relative_to(ROOT).as_posix()
            records[code] = {
                "decor": code,
                "file": preview_path.name,
                "path": rel,
                "url": f"/{rel}",
                "previewPath": rel,
                "previewUrl": f"/{rel}",
                "previewOnly": True,
                "bytes": preview_path.stat().st_size,
            }
        else:
            missing.append(code)
    return records, missing


def get_source_for_code(code: str) -> str:
    return "cleaf" if str(code).upper().startswith("S") else "egger"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build website-ready Egger texture DB JSON.")
    parser.add_argument("--catalog", default=str(CATALOG_PATH))
    parser.add_argument("--textures-dir", default=str(TEXTURES_DIR))
    parser.add_argument("--preview-dir", default=str(PREVIEW_DIR))
    parser.add_argument("--failed", default=str(FAILED_PATH))
    parser.add_argument("--out", default=str(OUT_PATH))
    parser.add_argument("--deploy-out", default=str(DEPLOY_OUT_PATH))
    args = parser.parse_args()

    catalog_path = Path(args.catalog).resolve()
    textures_dir = Path(args.textures_dir).resolve()
    preview_dir = Path(args.preview_dir).resolve()
    failed_path = Path(args.failed).resolve()
    out_path = Path(args.out).resolve()
    deploy_out_path = Path(args.deploy_out).resolve()

    codes = load_catalog_codes(catalog_path)
    failed_map = load_failed_map(failed_path)
    textures, missing = build_texture_records(codes, textures_dir, preview_dir)

    missing_rows = []
    for code in missing:
        source = get_source_for_code(code)
        default_reason = "source CLEAF" if source == "cleaf" else "texture file not found"
        missing_rows.append(
            {
                "decor": code,
                "source": source,
                "reason": failed_map.get(code, default_reason),
            }
        )

    payload = {
        "source": "egger.com",
        "generatedBy": "scripts/build_egger_textures_db.py",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "textureBasePath": "assets/egger-textures",
        "countRequested": len(codes),
        "countAvailable": len(textures),
        "countMissing": len(missing_rows),
        "countMissingEgger": sum(1 for x in missing_rows if x.get("source") == "egger"),
        "countMissingCleaf": sum(1 for x in missing_rows if x.get("source") == "cleaf"),
        "textures": textures,
        "missing": missing_rows,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    deploy_out_path.parent.mkdir(parents=True, exist_ok=True)
    deploy_out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Saved: {out_path}")
    print(f"Saved: {deploy_out_path}")
    print(
        f"Done. Requested: {len(codes)}, Available: {len(textures)}, Missing: {len(missing_rows)}"
    )


if __name__ == "__main__":
    main()

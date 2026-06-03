"""Download EGGER decor images when direct CDN URLs are known."""
import json
import re
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "egger-textures"
MAP_PATH = ROOT / "assets" / "egger-9-image-urls.json"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)


def extract_from_html(html: str) -> str | None:
    match = re.search(
        r"<egger-decorimagedownloads[^>]*>\s*<script type=\"application/json\">\s*(\{.*?\})\s*</script>",
        html,
        re.S,
    )
    if match:
        try:
            data = json.loads(match.group(1))
            items = data.get("data", {}).get("downloads", {}).get("imageDownloadItems", [])
            for item in items:
                for field in ("url", "thumbUrl"):
                    url = (item.get(field, {}) or {}).get("url") or ""
                    if "/original." in url.lower():
                        return url.replace("\\u0026", "&")
            for item in items:
                for field in ("url", "thumbUrl"):
                    url = (item.get(field, {}) or {}).get("url") or ""
                    if url:
                        return url.replace("\\u0026", "&")
        except json.JSONDecodeError:
            pass
    match = re.search(
        r'src="([^"]+/img/pim/[^"]+/original\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"',
        html,
        re.I,
    )
    return match.group(1) if match else None


def download_code(session: requests.Session, code: str, image_url: str) -> tuple[bool, str]:
    headers = {
        "User-Agent": UA,
        "Referer": "https://www.egger.com/",
    }
    resp = session.get(image_url, headers=headers, timeout=60)
    if resp.status_code != 200 or not resp.content:
        return False, f"{code}: image HTTP {resp.status_code}"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{code}.jpg"
    out_path.write_bytes(resp.content)
    return True, f"{code}: saved {out_path.name} ({len(resp.content)} bytes)"


def main() -> None:
    if not MAP_PATH.exists():
        raise SystemExit(f"Missing URL map: {MAP_PATH}")

    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    session = requests.Session()
    ok = 0
    fail = 0
    for code, image_url in mapping.items():
        if not image_url:
            print(f"{code}: no url")
            fail += 1
            continue
        success, message = download_code(session, code.upper(), image_url)
        print(message)
        if success:
            ok += 1
        else:
            fail += 1
    print(f"Done. Success: {ok}, Failed: {fail}")


if __name__ == "__main__":
    main()

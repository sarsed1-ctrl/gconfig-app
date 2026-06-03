import argparse
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CODES_PATH = ROOT / "assets" / "cleaf-textures-needed.txt"
DEFAULT_OUT_DIR = ROOT / "assets" / "egger-textures"
SITEMAP_URL = "https://cleaf.it/sitemap.xml"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)


def load_codes(args_codes: list[str], codes_file: Path) -> list[str]:
    out: set[str] = set()
    for c in args_codes:
        code = c.strip().upper()
        if re.fullmatch(r"S\d{2,4}", code):
            out.add(code)
    if codes_file.exists():
        for row in codes_file.read_text(encoding="utf-8").splitlines():
            code = row.strip().upper()
            if re.fullmatch(r"S\d{2,4}", code):
                out.add(code)
    return sorted(out)


def load_sitemap_urls(session: requests.Session) -> list[str]:
    xml_text = session.get(SITEMAP_URL, timeout=60).text
    root = ET.fromstring(xml_text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [n.text for n in root.findall(".//sm:url/sm:loc", ns) if n.text]


def find_product_url_for_code(code: str, all_urls: list[str]) -> str | None:
    code_l = code.lower()
    matches = [u for u in all_urls if f"-{code_l}/" in u.lower()]
    if not matches:
        return None
    for u in matches:
        if "/products/" in u:
            return u
    return matches[0]


def parse_dim_score(url: str) -> int:
    m = re.search(r"/(\d+)x(\d+)/", url)
    if not m:
        return -1
    return int(m.group(1)) * int(m.group(2))


def extract_best_image_url(html: str, code: str) -> str | None:
    urls = re.findall(
        r'https?://[^\s"\\\']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"\\\']*)?', html, re.I
    )
    code_l = code.lower()

    # Prefer image URLs that include the exact code in filename/path.
    with_code = [u for u in urls if code_l in u.lower()]
    candidates = with_code if with_code else urls
    if not candidates:
        return None

    # Prefer biggest known dimension from URL.
    candidates = sorted(set(candidates), key=parse_dim_score, reverse=True)
    return candidates[0]


def download_one(
    session: requests.Session, code: str, all_urls: list[str], out_dir: Path
) -> tuple[bool, str]:
    page_url = find_product_url_for_code(code, all_urls)
    if not page_url:
        return False, f"{code}: page not found in sitemap"

    page = session.get(page_url, timeout=60)
    if page.status_code != 200:
        return False, f"{code}: page {page.status_code}"

    image_url = extract_best_image_url(page.text, code)
    if not image_url:
        return False, f"{code}: image url not found"

    img = session.get(image_url, timeout=60)
    if img.status_code != 200 or not img.content:
        return False, f"{code}: image {img.status_code}"

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{code}.jpg"
    out_path.write_bytes(img.content)
    return True, f"{code}: saved {out_path.name}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download CLEAF textures for S-codes.")
    parser.add_argument("--codes", nargs="*", default=[], help="S-codes, e.g. S162 S158")
    parser.add_argument("--codes-file", default=str(DEFAULT_CODES_PATH))
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument(
        "--failed-out",
        default=str(ROOT / "assets" / "cleaf-textures-failed.txt"),
        help="Path for failed CLEAF codes list",
    )
    args = parser.parse_args()

    codes = load_codes(args.codes, Path(args.codes_file).resolve())
    if not codes:
        raise SystemExit("No CLEAF codes found.")

    session = requests.Session()
    session.headers.update({"User-Agent": UA})
    all_urls = load_sitemap_urls(session)
    out_dir = Path(args.out_dir).resolve()
    failed_out = Path(args.failed_out).resolve()

    ok = 0
    fail = 0
    failed_rows: list[str] = []
    for code in codes:
        success, msg = download_one(session, code, all_urls, out_dir)
        print(msg)
        if success:
            ok += 1
        else:
            fail += 1
            failed_rows.append(f"{code}|{msg}")

    failed_out.parent.mkdir(parents=True, exist_ok=True)
    failed_out.write_text("\n".join(failed_rows) + ("\n" if failed_rows else ""), encoding="utf-8")
    print(f"Failed list: {failed_out}")
    print(f"Done. Success: {ok}, Failed: {fail}, Output: {out_dir}")


if __name__ == "__main__":
    main()

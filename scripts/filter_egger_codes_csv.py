import csv
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

SITEMAP_INDEX_URL = "https://www.egger.com/sitemap/index.xml"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)
CODE_RE = re.compile(r"[A-Z]\d{3,4}")


def load_codes(csv_path: Path) -> list[str]:
    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        rows = [((row.get("decor_code") or "").strip().upper()) for row in reader]
    return [c for c in rows if CODE_RE.fullmatch(c)]


def fetch_existing_codes(session: requests.Session) -> set[str]:
    idx = session.get(SITEMAP_INDEX_URL, timeout=40)
    idx.raise_for_status()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(idx.text)
    sitemap_urls = [n.text for n in root.findall(".//sm:sitemap/sm:loc", ns) if n.text]
    pimedp_urls = [u for u in sitemap_urls if "/pimedp-" in u]

    found: set[str] = set()
    for sm_url in pimedp_urls:
        resp = session.get(sm_url, timeout=40)
        if resp.status_code != 200:
            continue
        try:
            sm_root = ET.fromstring(resp.text)
        except ET.ParseError:
            continue
        for loc in sm_root.findall(".//sm:url/sm:loc", ns):
            text = (loc.text or "").upper()
            m = re.search(r"/DECORS/([A-Z]\d{3,4})_[A-Z0-9]+", text)
            if m:
                found.add(m.group(1))
    return found


def write_codes(csv_path: Path, codes: list[str]) -> None:
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["decor_code"])
        for code in codes:
            writer.writerow([code])


def main() -> None:
    csv_path = Path(
        r"C:\Users\georgi\OneDrive - AM furnitura\Desktop\GConfig\assets\egger-textures-missing-codes.csv"
    )
    removed_path = csv_path.with_name("egger-textures-missing-codes-removed.csv")
    found_path = csv_path.with_name("egger-textures-missing-codes-found.csv")

    input_codes = load_codes(csv_path)
    session = requests.Session()
    session.headers.update({"User-Agent": UA})
    egger_codes = fetch_existing_codes(session)

    kept = sorted([c for c in input_codes if c in egger_codes])
    removed = sorted([c for c in input_codes if c not in egger_codes])

    # Main file now contains only codes found on EGGER.
    write_codes(csv_path, kept)
    write_codes(found_path, kept)
    write_codes(removed_path, removed)

    print(f"Input: {len(input_codes)}")
    print(f"Found: {len(kept)}")
    print(f"Removed: {len(removed)}")
    print(f"Updated file: {csv_path}")
    print(f"Found file: {found_path}")
    print(f"Removed file: {removed_path}")


if __name__ == "__main__":
    main()

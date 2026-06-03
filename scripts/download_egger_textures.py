import argparse
import concurrent.futures
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable

import requests


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "assets" / "egger-textures"
DEFAULT_FAILED_OUT = ROOT / "assets" / "egger-textures-failed.txt"
DEFAULT_CLEAF_OUT = ROOT / "assets" / "cleaf-textures-needed.txt"
DEFAULT_CODES_FILE = ROOT / "assets" / "egger-textures-missing-codes.txt"
CATALOG_PATH = ROOT / "assets" / "eamf-catalog.json"
SITEMAP_INDEX_URL = "https://www.egger.com/sitemap/index.xml"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)


def load_codes_from_catalog() -> list[str]:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
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


def load_egger_decor_pages(session: requests.Session) -> dict[str, str]:
    idx = session.get(SITEMAP_INDEX_URL, timeout=40)
    idx.raise_for_status()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(idx.text)
    sitemap_urls = [n.text for n in root.findall(".//sm:sitemap/sm:loc", ns) if n.text]
    pimedp_urls = [u for u in sitemap_urls if "/pimedp-" in u]

    decor_pages: dict[str, str] = {}
    for sm_url in pimedp_urls:
        resp = session.get(sm_url, timeout=40)
        if resp.status_code != 200:
            continue
        try:
            sm_root = ET.fromstring(resp.text)
        except ET.ParseError:
            continue

        for loc in sm_root.findall(".//sm:url/sm:loc", ns):
            text = loc.text or ""
            match = re.search(r"/decors/([A-Z]\d{3,4}_[A-Z0-9]+)", text)
            if match:
                decor_pages[match.group(1)] = text

    return decor_pages


def load_all_sitemap_urls(session: requests.Session) -> list[str]:
    idx = session.get(SITEMAP_INDEX_URL, timeout=40)
    idx.raise_for_status()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(idx.text)
    sitemap_urls = [n.text for n in root.findall(".//sm:sitemap/sm:loc", ns) if n.text]

    all_urls: set[str] = set()
    for sm_url in sitemap_urls:
        resp = session.get(sm_url, timeout=40)
        if resp.status_code != 200:
            continue
        try:
            sm_root = ET.fromstring(resp.text)
        except ET.ParseError:
            continue
        for loc in sm_root.findall(".//sm:url/sm:loc", ns):
            text = (loc.text or "").strip()
            if text:
                all_urls.add(text)
    return sorted(all_urls)


def build_aggressive_code_urls(code: str, sitemap_urls: list[str]) -> list[str]:
    code_u = code.upper()
    code_l = code.lower()
    out: list[str] = []
    for url in sitemap_urls:
        u = url.lower()
        if code_l not in u:
            continue
        # Ignore obvious non-product URLs with params only.
        if "/decors/" in u or "/dekore/" in u or "/dekory/" in u or "/dekor" in u:
            out.append(url)
            continue
        # Keep urls where code appears in slug/path segment.
        if re.search(rf"(^|[/_\-]){re.escape(code_l)}([/_\-]|$)", u):
            out.append(url)
            continue
        # Keep direct decor_id style in any locale path.
        if re.search(rf"{re.escape(code_l)}_[a-z0-9]+", u):
            out.append(url)
            continue
        # Keep plain upper code hits as fallback.
        if code_u in url:
            out.append(url)
    return dedupe_keep_order(out)


def load_targeted_aggressive_urls(
    session: requests.Session, codes: list[str]
) -> dict[str, list[str]]:
    idx = session.get(SITEMAP_INDEX_URL, timeout=40)
    idx.raise_for_status()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(idx.text)
    sitemap_urls = [n.text for n in root.findall(".//sm:sitemap/sm:loc", ns) if n.text]
    if not codes:
        return {}

    codes_u = sorted(set(codes))
    code_re = re.compile(r"\b(" + "|".join(re.escape(c) for c in codes_u) + r")\b", re.I)
    by_code: dict[str, list[str]] = {c: [] for c in codes_u}

    for i, sm_url in enumerate(sitemap_urls, start=1):
        resp = session.get(sm_url, timeout=40)
        if resp.status_code != 200:
            continue
        try:
            sm_root = ET.fromstring(resp.text)
        except ET.ParseError:
            continue
        for loc in sm_root.findall(".//sm:url/sm:loc", ns):
            text = (loc.text or "").strip()
            if not text:
                continue
            for m in code_re.finditer(text.upper()):
                code = m.group(1).upper()
                by_code.setdefault(code, []).append(text)

        if i % 20 == 0:
            print(f"Aggressive scan progress: {i}/{len(sitemap_urls)} sitemaps")

    for code in list(by_code.keys()):
        by_code[code] = dedupe_keep_order(by_code[code])
    return by_code


def pick_decor_id(code: str, all_ids: Iterable[str]) -> str | None:
    matches = [decor_id for decor_id in all_ids if decor_id.startswith(f"{code}_")]
    if not matches:
        return None

    preferred = []
    for decor_id in matches:
        suffix = decor_id.split("_", 1)[1].upper()
        if suffix.startswith("ST"):
            preferred.append((0, decor_id))
        elif suffix.startswith("TM") or suffix.startswith("PM"):
            preferred.append((1, decor_id))
        else:
            preferred.append((2, decor_id))

    preferred.sort(key=lambda x: (x[0], x[1]))
    return preferred[0][1]


def build_alternative_page_urls(code: str) -> list[str]:
    suffixes = [
        "10",
        "ST10",
        "ST9",
        "ST12",
        "ST22",
        "ST28",
        "ST37",
        "ST38",
        "ST40",
        "TM9",
        "TM12",
        "PM9",
    ]
    locale_paths = [
        "en/furniture-interior-design",
        "de/moebel-innenausbau",
        "pl/meble-i-aranzacja-wnetrz",
        "ru/mebel-i-dizayn-interera",
        "cs/nabytek-a-interierovy-design",
        "sk/nabytok-a-interierovy-dizajn",
    ]
    decor_words = ["decors", "dekore", "dekory", "dekori", "dekorlar"]

    urls: list[str] = []
    for loc in locale_paths:
        for word in decor_words:
            for suffix in suffixes:
                urls.append(f"https://www.egger.com/{loc}/{word}/{code}_{suffix}")
    return urls


def extract_full_image_url(html: str) -> str | None:
    # Main source: JSON inside image download component.
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
                    if "/original." in url:
                        return url.replace("\\u0026", "&")
            # fallback to first URL if no explicit original found
            for item in items:
                for field in ("url", "thumbUrl"):
                    url = (item.get(field, {}) or {}).get("url") or ""
                    if url:
                        return url.replace("\\u0026", "&")
        except json.JSONDecodeError:
            pass

    # Fallback: image src directly in page.
    match = re.search(r'src="([^"]+/original\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"', html, re.I)
    if match:
        return match.group(1)
    return None


def normalize_image_url(url: str) -> str:
    # remove width params so we keep full-size texture
    return re.sub(r"([?&])width=\d+", "", url)


def download_texture(session: requests.Session, code: str, page_url: str, out_dir: Path) -> tuple[bool, str]:
    page = session.get(page_url, timeout=12)
    if page.status_code != 200:
        return False, f"{code}: page {page.status_code}"

    image_url = extract_full_image_url(page.text)
    if not image_url:
        return False, f"{code}: no image url"

    image_url = normalize_image_url(image_url)
    img = session.get(image_url, timeout=20)
    if img.status_code != 200 or not img.content:
        return False, f"{code}: image {img.status_code}"

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{code}.jpg"
    out_path.write_bytes(img.content)
    return True, f"{code}: saved {out_path.name}"


def score_decor_id(decor_id: str) -> tuple[int, str]:
    suffix = decor_id.split("_", 1)[1].upper()
    if suffix.startswith("ST10") or suffix == "10":
        return (0, decor_id)
    if suffix.startswith("ST"):
        return (1, decor_id)
    if suffix.startswith("TM") or suffix.startswith("PM"):
        return (2, decor_id)
    return (3, decor_id)


def build_code_pages_map(decor_pages: dict[str, str]) -> dict[str, list[str]]:
    by_code: dict[str, list[str]] = {}
    grouped_ids: dict[str, list[str]] = {}
    for decor_id in decor_pages.keys():
        code = decor_id.split("_", 1)[0].upper()
        grouped_ids.setdefault(code, []).append(decor_id)

    for code, decor_ids in grouped_ids.items():
        ordered_ids = sorted(decor_ids, key=score_decor_id)
        by_code[code] = [decor_pages[did] for did in ordered_ids]
    return by_code


def dedupe_keep_order(urls: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        out.append(url)
    return out


def url_priority(url: str) -> tuple[int, int, str]:
    u = url.lower()
    score = 99
    if "/decors/" in u:
        score = 0
    elif "/dekore/" in u or "/dekory/" in u:
        score = 1
    elif "/furniture-interior-design/" in u:
        score = 2
    elif "/moebel-innenausbau/" in u:
        score = 3
    return (score, len(url), url)


def prioritize_candidate_urls(urls: list[str], cap: int = 24) -> list[str]:
    uniq = dedupe_keep_order(urls)
    uniq.sort(key=url_priority)
    return uniq[:cap]


def try_download_texture(
    session: requests.Session, code: str, page_urls: list[str], out_dir: Path
) -> tuple[bool, str]:
    last_reason = "no candidate url"
    for page_url in page_urls:
        success, message = download_texture(session, code, page_url, out_dir)
        if success:
            return True, message
        last_reason = message
    return False, last_reason


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download Egger decor textures and rename to DECOR_CODE.jpg"
    )
    parser.add_argument(
        "--codes",
        nargs="*",
        help="Specific decor codes, e.g. H3730 U999. If not set, uses codes from assets/eamf-catalog.json",
    )
    parser.add_argument(
        "--codes-file",
        default=str(DEFAULT_CODES_FILE),
        help=f"File with one decor code per line (default: {DEFAULT_CODES_FILE})",
    )
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUT_DIR),
        help=f"Output folder (default: {DEFAULT_OUT_DIR})",
    )
    parser.add_argument(
        "--failed-out",
        default=str(DEFAULT_FAILED_OUT),
        help=f"Where to write failed codes list (default: {DEFAULT_FAILED_OUT})",
    )
    parser.add_argument(
        "--cleaf-out",
        default=str(DEFAULT_CLEAF_OUT),
        help=f"Where to write S* codes for CLEAF search (default: {DEFAULT_CLEAF_OUT})",
    )
    parser.add_argument(
        "--aggressive",
        action="store_true",
        help="Also search all EGGER sitemap URLs for matching code slugs",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=8,
        help="Parallel workers (default: 8)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    codes = [c.strip().upper() for c in (args.codes or []) if c.strip()]
    codes_file = Path(args.codes_file).resolve()
    if codes_file.exists():
        for row in codes_file.read_text(encoding="utf-8").splitlines():
            code = row.strip().upper()
            if re.fullmatch(r"[A-Z]\d{3,4}", code):
                codes.append(code)
    if not codes:
        codes = load_codes_from_catalog()
    codes = sorted(set(codes))

    if not codes:
        raise SystemExit("No decor codes provided/found.")

    session = requests.Session()
    session.headers.update({"User-Agent": UA})
    decor_pages = load_egger_decor_pages(session)
    if not decor_pages:
        raise SystemExit("Could not load Egger decor IDs from sitemap.")
    all_ids = sorted(decor_pages.keys())
    code_pages = build_code_pages_map(decor_pages)
    egger_codes_for_scan = [c for c in codes if not c.startswith("S")]
    aggressive_code_urls = (
        load_targeted_aggressive_urls(session, egger_codes_for_scan) if args.aggressive else {}
    )

    out_dir = Path(args.out_dir).resolve()
    failed_out = Path(args.failed_out).resolve()
    cleaf_out = Path(args.cleaf_out).resolve()
    ok = 0
    fail = 0
    failed_rows: list[str] = []
    cleaf_codes: list[str] = []
    jobs: list[tuple[str, list[str]]] = []
    for code in codes:
        if code.startswith("S"):
            cleaf_codes.append(code)
            fail += 1
            message = f"{code}: source CLEAF (skip EGGER)"
            failed_rows.append(f"{code}|{message}")
            print(message)
            continue
        decor_id = pick_decor_id(code, all_ids)
        candidate_urls = list(code_pages.get(code, []))
        if not candidate_urls and decor_id:
            candidate_urls = [decor_pages[decor_id]]
        candidate_urls.extend(build_alternative_page_urls(code))
        if aggressive_code_urls:
            candidate_urls.extend(aggressive_code_urls.get(code, []))
        candidate_urls = prioritize_candidate_urls(candidate_urls, cap=24)
        jobs.append((code, candidate_urls))

    def run_job(item: tuple[str, list[str]]) -> tuple[str, bool, str]:
        code, candidate_urls = item
        local_session = requests.Session()
        local_session.headers.update({"User-Agent": UA})
        try:
            success, message = try_download_texture(local_session, code, candidate_urls, out_dir)
            return code, success, message
        except Exception as exc:
            return code, False, f"{code}: error {exc}"

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.max_workers)) as ex:
        for code, success, message in ex.map(run_job, jobs):
            print(message)
            if success:
                ok += 1
            else:
                fail += 1
                failed_rows.append(f"{code}|{message}")

    failed_out.parent.mkdir(parents=True, exist_ok=True)
    failed_out.write_text("\n".join(failed_rows) + ("\n" if failed_rows else ""), encoding="utf-8")
    cleaf_out.parent.mkdir(parents=True, exist_ok=True)
    cleaf_out.write_text(
        "\n".join(sorted(set(cleaf_codes))) + ("\n" if cleaf_codes else ""),
        encoding="utf-8",
    )
    print(f"Failed list: {failed_out}")
    print(f"CLEAF list: {cleaf_out}")
    print(f"Done. Success: {ok}, Failed: {fail}, Output: {out_dir}")


if __name__ == "__main__":
    main()

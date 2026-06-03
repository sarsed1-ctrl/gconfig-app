import concurrent.futures
import io
import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

import requests
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "assets" / "eamf-catalog.json"
OUT_PATH = ROOT / "assets" / "egger-decor-colors.json"
BASE_URL = "https://www.egger.com/en/furniture-interior-design/decors/{decor_id}?country=US"
SITEMAP_INDEX_URL = "https://www.egger.com/sitemap/index.xml"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)


def normalize_texture_from_article(article: str):
    if not article:
        return None
    m = re.search(r"\.(ST|TM|PM)(\d{1,2})\.", article.upper())
    if not m:
        return None
    prefix, num = m.group(1), m.group(2)
    if prefix == "ST":
        return str(int(num))
    return f"{prefix}{int(num)}"


def collect_decor_codes(catalog):
    # Build candidates from all material-like arrays in catalog.
    arrays = []
    for key in ("materials", "countertops"):
        arr = catalog.get(key)
        if isinstance(arr, list):
            arrays.extend(arr)

    by_decor = defaultdict(set)
    for row in arrays:
        if not isinstance(row, dict):
            continue
        decor = str(row.get("decor") or "").strip().upper()
        if not re.fullmatch(r"[A-Z]\d{3,4}", decor):
            continue
        tex = normalize_texture_from_article(str(row.get("article") or row.get("code") or ""))
        if tex:
            by_decor[decor].add(tex)
        else:
            # Keep decor even if texture token missing in local article.
            by_decor[decor]

    return by_decor


def load_egger_decor_ids(session: requests.Session):
    idx = session.get(SITEMAP_INDEX_URL, timeout=30)
    idx.raise_for_status()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(idx.text)
    sitemap_urls = [n.text for n in root.findall(".//sm:sitemap/sm:loc", ns) if n.text]
    pimedp_urls = [u for u in sitemap_urls if "/pimedp-" in u]

    decor_ids = []
    for sm_url in pimedp_urls:
        r = session.get(sm_url, timeout=30)
        if r.status_code != 200:
            continue
        try:
            sm_root = ET.fromstring(r.text)
        except ET.ParseError:
            continue
        for loc in sm_root.findall(".//sm:url/sm:loc", ns):
            if not loc.text:
                continue
            m = re.search(r"/decors/([A-Z]\d{3,4}_[A-Z0-9]+)", loc.text)
            if m:
                decor_ids.append(m.group(1))
    return sorted(set(decor_ids))


def choose_decor_id_for_code(decor: str, preferred_tokens, all_ids):
    same = [d for d in all_ids if d.startswith(f"{decor}_")]
    if not same:
        return None
    if preferred_tokens:
        # Prefer ids whose suffix includes local texture token hint.
        for token in preferred_tokens:
            token_u = token.upper()
            for did in same:
                suffix = did.split("_", 1)[1].upper()
                if suffix == token_u:
                    return did
                if suffix == f"ST{token_u}" or suffix.endswith(token_u):
                    return did
    # Fallback: stable first sorted id for this decor.
    return sorted(same)[0]


def extract_image_url(html: str):
    # Prefer JSON image download block.
    m = re.search(
        r"<egger-decorimagedownloads[^>]*>\s*<script type=\"application/json\">\s*(\{.*?\})\s*</script>",
        html,
        re.S,
    )
    if m:
        try:
            data = json.loads(m.group(1))
            items = (
                data.get("data", {})
                .get("downloads", {})
                .get("imageDownloadItems", [])
            )
            for item in items:
                url = (
                    item.get("thumbUrl", {}).get("url")
                    or item.get("url", {}).get("url")
                    or ""
                )
                if url:
                    return url.replace("\\u0026", "&")
        except Exception:
            pass

    # Fallback: first original image in picture.
    m = re.search(r"<img[^>]+src=\"([^\"]+/original\.(?:png|jpg|jpeg|webp))\"", html, re.I)
    if m:
        return m.group(1)
    return None


def avg_color_hex_from_image_bytes(blob: bytes):
    with Image.open(io.BytesIO(blob)) as im:
        im = im.convert("RGB")
        # Fast resize keeps perf good.
        im = im.resize((24, 24))
        pixels = list(im.getdata())
        r = sum(p[0] for p in pixels) / len(pixels)
        g = sum(p[1] for p in pixels) / len(pixels)
        b = sum(p[2] for p in pixels) / len(pixels)
    return f"#{int(r):02x}{int(g):02x}{int(b):02x}"


def fetch_decor_color(session: requests.Session, decor: str, decor_id: str):
    url = BASE_URL.format(decor_id=decor_id)
    resp = session.get(url, timeout=20)
    if resp.status_code != 200:
        return None
    html = resp.text
    if "data-page-id=\"decordetail_edp\"" not in html:
        return None
    image_url = extract_image_url(html)
    if not image_url:
        return None
    if "width=" in image_url:
        pass
    elif image_url.endswith(".webp") or ".webp?" in image_url:
        sep = "&" if "?" in image_url else "?"
        image_url = f"{image_url}{sep}width=160"
    img = session.get(image_url, timeout=20)
    if img.status_code != 200 or not img.content:
        return None
    return {
        "decor": decor,
        "decorId": decor_id,
        "sourcePage": url,
        "sourceImage": image_url,
        "hex": avg_color_hex_from_image_bytes(img.content),
    }


def main():
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    decor_hints = collect_decor_codes(catalog)
    if not decor_hints:
        raise SystemExit("No decor candidates found.")

    session = requests.Session()
    session.headers.update({"User-Agent": UA})
    all_decor_ids = load_egger_decor_ids(session)
    if not all_decor_ids:
        raise SystemExit("No Egger decor ids found in sitemap.")

    chosen = {}
    missing_decors = []
    for decor, tex_hints in sorted(decor_hints.items()):
        did = choose_decor_id_for_code(decor, sorted(tex_hints), all_decor_ids)
        if not did:
            missing_decors.append(decor)
            continue
        chosen[decor] = did

    resolved = {}
    failed_ids = []

    def job(item):
        decor, decor_id = item
        try:
            return fetch_decor_color(session, decor, decor_id)
        except Exception:
            return {"decor": decor, "decorId": decor_id, "error": True}

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for result in ex.map(job, chosen.items()):
            if not result:
                continue
            if result.get("error"):
                failed_ids.append(result["decorId"])
                continue
            resolved[result["decor"]] = result

    out = {
        "source": "egger.com decor pages",
        "generatedBy": "scripts/build_egger_colors.py",
        "fromSitemapCount": len(all_decor_ids),
        "catalogDecorCount": len(decor_hints),
        "count": len(resolved),
        "colors": {k: v for k, v in sorted(resolved.items())},
        "missingDecorsFromEggerSitemap": missing_decors[:400],
        "failedDecorIdsSample": failed_ids[:200],
    }
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Decor colors collected: {len(resolved)}")
    print(f"Output: {OUT_PATH}")


if __name__ == "__main__":
    main()

import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

TEMP = os.environ.get("TEMP", "/tmp")
for name in ["amflex-scripts.js", "amflex-vendor.js"]:
    path = os.path.join(TEMP, name)
    if not os.path.exists(path):
        print(f"missing {path}")
        continue
    text = open(path, encoding="utf-8", errors="ignore").read()
    apis = set(re.findall(r'["\'](/api/[^"\']+)["\']', text))
    apis |= set(re.findall(r'["\'](api/[^"\']+)["\']', text))
    print(f"=== {name} ({len(text)} bytes) ===")
    for a in sorted(apis):
        print(a)
    for pat in [r'/api/[A-Za-z0-9_]+', r'GetTranslation', r'forwardOrder', r'calculate', r'importExcel', r'ImportExcel', r'uploadExcel', r'UploadExcel', r'getPrice', r'Price']:
        found = sorted(set(re.findall(pat, text, re.I)))
        if found:
            print(f"pattern {pat}: {found[:30]}")

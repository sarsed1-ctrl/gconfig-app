import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
path = os.path.join(os.environ["TEMP"], "amflex-scripts.js")
text = open(path, encoding="utf-8", errors="ignore").read()

needles = [
    "ImportFile",
    "GetOrderItems",
    "getOrderId",
    "getPrice",
    "processFile",
    "importExcel",
    "Upload",
    "xlsx",
    "XLSX",
    "readAsBinaryString",
    "readAsArrayBuffer",
]
for needle in needles:
    idx = 0
    n = 0
    while n < 8:
        i = text.find(needle, idx)
        if i < 0:
            break
        snippet = text[max(0, i - 150) : i + 250]
        print(f"\n=== {needle} @ {i} ===")
        print(snippet)
        idx = i + len(needle)
        n += 1

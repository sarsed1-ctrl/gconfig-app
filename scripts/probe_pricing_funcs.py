import os, sys
sys.stdout.reconfigure(encoding="utf-8")
text = open(os.path.join(os.environ["TEMP"], "amflex-scripts.js"), encoding="utf-8", errors="ignore").read()
funcs = [
    "getMaterialPrice",
    "getWidthForPriceCalculation",
    "sideWithMargin",
    "getPressingPrice",
    "getFestoolProcessingPrice",
    "getMaterialSettingForThickness",
    "processRows",
    "parseRow",
]
for fn in funcs:
    for needle in [fn + ":function", fn + "=function", fn + "=function"]:
        i = text.find(needle)
        if i >= 0:
            print(f"\n=== {needle} @ {i} ===")
            print(text[i:i+1200])
            break

import os, sys
sys.stdout.reconfigure(encoding="utf-8")
text = open(os.path.join(os.environ["TEMP"], "amflex-scripts.js"), encoding="utf-8", errors="ignore").read()
for needle in ["processRow:function", "processRow=", "addItem:function", "GetMaterials"]:
    i = text.find(needle)
    if i >= 0:
        print(f"\n=== {needle} @ {i} ===")
        print(text[i:i+1800])

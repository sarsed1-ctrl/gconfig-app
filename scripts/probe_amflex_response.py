import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
path = os.path.join(os.environ["TEMP"], "amflex-scripts.js")
text = open(path, encoding="utf-8", errors="ignore").read()

start = text.find("GetOrderItems")
print(text[start : start + 2500])

print("\n\n=== getTotalPrice area ===")
start = text.find("getTotalPrice:function")
print(text[start : start + 1200])

print("\n\n=== getPrice function ===")
start = text.find("getPrice:function")
if start < 0:
    start = text.find("getPrice:")
print(text[start : start + 2000])

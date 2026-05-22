import os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
text = open(os.path.join(os.environ["TEMP"], "amflex-scripts.js"), encoding="utf-8", errors="ignore").read()
for m in re.finditer(r'url:"https://amflexapi[^"]+"', text):
    print(m.group(0))

import os, sys
sys.stdout.reconfigure(encoding="utf-8")
text = open(os.path.join(os.environ["TEMP"], "amflex-scripts.js"), encoding="utf-8", errors="ignore").read()
for svc in ['finishes', 'plastics']:
    start = text.find(f'.service("{svc}"')
    print(f"\n=== {svc} ===")
    print(text[start:start+900])

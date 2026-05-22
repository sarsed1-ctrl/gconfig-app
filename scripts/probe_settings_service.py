import os, sys
sys.stdout.reconfigure(encoding="utf-8")
text = open(os.path.join(os.environ["TEMP"], "amflex-scripts.js"), encoding="utf-8", errors="ignore").read()
start = text.find('angular.module("amflexApp").service("settings"')
print(text[start:start+3500])

"""Inspect Amflex Imports_Excel.xlsx structure."""
import os
import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding="utf-8")
path = os.path.join(os.environ["TEMP"], "Imports_Excel.xlsx")
z = zipfile.ZipFile(path)
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ss = []
if "xl/sharedStrings.xml" in z.namelist():
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall(".//m:si", ns):
        ss.append("".join((t.text or "") for t in si.findall(".//m:t", ns)))

sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
for row in sheet.findall(".//m:sheetData/m:row", ns)[:20]:
    rn = row.get("r")
    cells = []
    for c in row.findall("m:c", ns):
        ref = c.get("r", "")
        t = c.get("t")
        v = c.find("m:v", ns)
        val = v.text if v is not None else ""
        if t == "s" and val.isdigit():
            val = ss[int(val)]
        cells.append(f"{ref}={val}")
    if cells:
        print(f"Row {rn}: " + " | ".join(cells))

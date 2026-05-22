#!/usr/bin/env python3
"""Resolve configurator.html rebase conflicts (EAMF + origin/main)."""
from __future__ import annotations

import re
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "configurator.html"


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    replacements = [
        (
            r"<<<<<<< HEAD\n"
            r"            bed_carcass_thick: \"Толщина MDF каркаса \(мм\):\",\n"
            r"=======\n"
            r"            beds_mdf_carcass_thick: \"Толщина MDF каркаса \(мм\):\",\n"
            r"            eamf_materials_title: \"Материалы EAMF\",\n"
            r"            eamf_facade_material: \"Материал фасада:\",\n"
            r"            eamf_facade_edge: \"Кант фасада \(ABS\):\",\n"
            r"            eamf_carcass_material: \"Материал корпуса:\",\n"
            r"            eamf_carcass_edge: \"Кант корпуса \(ABS\):\",\n"
            r"            eamf_select_material: \"— Выберите материал —\",\n"
            r"            eamf_select_edge: \"— Выберите кант —\",\n"
            r"            eamf_select_material_first: \"Сначала выберите материал\",\n"
            r"            eamf_edges_airtec: \"AirTec Technology\",\n"
            r"            eamf_edges_same_color: \"Тот же код цвета\",\n"
            r"            eamf_edges_other: \"Другие канты\",\n"
            r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
            """            beds_mdf_carcass_thick: "Толщина MDF каркаса (мм):",
            eamf_materials_title: "Материалы EAMF",
            eamf_facade_material: "Материал фасада:",
            eamf_facade_edge: "Кант фасада (ABS):",
            eamf_carcass_material: "Материал корпуса:",
            eamf_carcass_edge: "Кант корпуса (ABS):",
            eamf_select_material: "— Выберите материал —",
            eamf_select_edge: "— Выберите кант —",
            eamf_select_material_first: "Сначала выберите материал",
            eamf_edges_airtec: "AirTec Technology",
            eamf_edges_same_color: "Тот же код цвета",
            eamf_edges_other: "Другие канты",""",
        ),
        (
            r"<<<<<<< HEAD\n"
            r"            bed_carcass_thick: \"MDF Carcass Thickness \(mm\):\",\n"
            r"=======\n"
            r"            beds_mdf_carcass_thick: \"MDF Carcass Thickness \(mm\):\",\n"
            r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
            '            beds_mdf_carcass_thick: "MDF Carcass Thickness (mm):",',
        ),
        (
            r"<<<<<<< HEAD\n"
            r"                <label data-i18n=\"facade_thick\">Facade Thickness \(mm\):</label>\n"
            r"                <select id=\"bedFacadeThick\">.*?"
            r"                </select>\n"
            r"            </div>\n"
            r"            <div class=\"form-group\">\n"
            r"=======\n"
            r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
            "",
        ),
        (
            r"<<<<<<< HEAD\n"
            r"                if \(\(select\.id === 'facadeThick' \|\| select\.id === 'bedFacadeThick'\) && opt\.value === '19'\) \{\n"
            r"=======\n"
            r"                const usePmFeelWood19 =\n"
            r"                    opt\.value === '19' &&\n"
            r"                    \(select\.id === 'facadeThick' \|\|\n"
            r"                        \(select\.id === 'carcassThick' && CONFIG_MODE !== 'beds'\)\);\n"
            r"                if \(usePmFeelWood19\) \{\n"
            r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
            """                const usePmFeelWood19 =
                    opt.value === '19' &&
                    (select.id === 'facadeThick' ||
                        (select.id === 'carcassThick' && CONFIG_MODE !== 'beds'));
                if (usePmFeelWood19) {""",
        ),
        (
            r"<<<<<<< HEAD\n"
            r"            // Headboard, footboard, side rails — use bed-specific facade thickness\.\n"
            r"            const bedFacadeT  = parseInt\(document\.getElementById\('bedFacadeThick'\)\?\.value \|\| '16', 10\);\n"
            r"            const railT       = bedFacadeT;\n"
            r"            const panelT      = bedFacadeT;\n"
            r"            const bedPerimeterMaterial = \(\) => bedFacadeT === 19 \? 'MDF/MFC' : `Chipboard \(MFC\) \$\{bedFacadeT\}mm`;\n"
            r"=======\n"
            r"            // Headboard, footboard, side rails — same thickness as \"Facade thickness\" \(LDSP frame\)\.\n"
            r"            const railT       = facadeT;\n"
            r"            const panelT      = facadeT;\n"
            r"            const bedPerimeterMaterial = \(\) => matFacade;\n"
            r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
            """            // Headboard, footboard, side rails — same thickness as "Facade thickness" (LDSP frame).
            const railT       = facadeT;
            const panelT      = facadeT;
            const bedPerimeterMaterial = () => matFacade;""",
        ),
        (
            r"<<<<<<< HEAD\n"
            r"            // Inner ledgers, center supports, deck strips — use bed-specific carcass thickness\.\n"
            r"            const bedCarcassT    = parseInt\(document\.getElementById\('bedCarcassThick'\)\?\.value \|\| '16', 10\);\n"
            r"            const ledgerT        = bedCarcassT;\n"
            r"            const centerSupportT = bedCarcassT;\n"
            r"=======\n"
            r"            // Inner ledgers, center supports, deck strips — thickness follows MDF carcass thickness \(general params\)\.\n"
            r"            const bedMdfT = normalizeBedMdfCarcassThicknessMm\(carcassT\);\n"
            r"            const bedMdfMat = \(\) => getBedMdfCarcassArticle\(bedMdfT\);\n"
            r"            const ledgerT     = bedMdfT;\n"
            r"            const centerSupportT = bedMdfT;\n"
            r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
            """            // Inner ledgers, center supports, deck strips — thickness follows MDF carcass thickness (general params).
            const bedMdfT = normalizeBedMdfCarcassThicknessMm(carcassT);
            const bedMdfMat = () => getBedMdfCarcassArticle(bedMdfT);
            const ledgerT     = bedMdfT;
            const centerSupportT = bedMdfT;""",
        ),
        (
            r"<<<<<<< HEAD\n"
            r"                stripThicknessMm: bedCarcassT\n"
            r"=======\n"
            r"                stripThicknessMm: bedMdfT\n"
            r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
            "                stripThicknessMm: bedMdfT",
        ),
    ]

    for pattern, repl in replacements:
        new_text, n = re.subn(pattern, repl, text, count=1, flags=re.DOTALL)
        if n != 1:
            raise SystemExit(f"Pattern did not match once: {pattern[:80]}... (matches={n})")
        text = new_text

    # bedParts block — keep EAMF matFacade/bedMdfMat but function form without args
    text, n = re.subn(
        r"<<<<<<< HEAD\n"
        r"                \{ name: getBedUILabel\(currentLang, 'headboard'\), qty: 1, l: outerW,   w: headboardH, t: panelT,   mat: bedPerimeterMaterial\(\) \},.*?"
        r"                \{ name: getBedUILabel\(currentLang, 'ledger'\) \+ ' \(R\)',   qty: 1, l: ledgerL,   w: ledgerW, t: ledgerT, mat: `MDF \$\{ledgerT\}mm` \}\n"
        r"=======\n"
        r"                \{ name: getBedUILabel\(currentLang, 'headboard'\), qty: 1, l: outerW,   w: headboardH, t: panelT,   mat: bedPerimeterMaterial\(panelT\) \},.*?"
        r"                \{ name: getBedUILabel\(currentLang, 'ledger'\) \+ ' \(R\)',   qty: 1, l: ledgerL,   w: ledgerW, t: ledgerT, mat: bedMdfMat\(\) \}\n"
        r">>>>>>> 3717296 \(Add EAMF materials integration, beds MDF carcass, and Tellimus Excel export\.\)",
        """                { name: getBedUILabel(currentLang, 'headboard'), qty: 1, l: outerW,   w: headboardH, t: panelT,   mat: bedPerimeterMaterial() },
                { name: getBedUILabel(currentLang, 'footboard'), qty: 1, l: outerW,   w: footboardH, t: panelT,   mat: bedPerimeterMaterial() },
                { name: getBedUILabel(currentLang, 'sideRail') + ' (L)', qty: 1, l: sideRailL, w: frameH, t: railT, mat: bedPerimeterMaterial() },
                { name: getBedUILabel(currentLang, 'sideRail') + ' (R)', qty: 1, l: sideRailL, w: frameH, t: railT, mat: bedPerimeterMaterial() },
                { name: getBedUILabel(currentLang, 'ledger') + ' (L)',   qty: 1, l: ledgerL,   w: ledgerW, t: ledgerT, mat: bedMdfMat() },
                { name: getBedUILabel(currentLang, 'ledger') + ' (R)',   qty: 1, l: ledgerL,   w: ledgerW, t: ledgerT, mat: bedMdfMat() }""",
        text,
        count=1,
        flags=re.DOTALL,
    )
    if n != 1:
        raise SystemExit(f"bedParts conflict matches={n}")

    if "<<<<<<<" in text:
        idx = text.index("<<<<<<<")
        raise SystemExit(f"Unresolved conflicts remain near: {text[idx:idx + 300]!r}")

    PATH.write_text(text, encoding="utf-8")
    print("All conflicts resolved.")


if __name__ == "__main__":
    main()

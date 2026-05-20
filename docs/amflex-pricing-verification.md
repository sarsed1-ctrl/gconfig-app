# Amflex pricing verification notes

Run:

```bash
node scripts/test-amflex-pricing.js "path/to/Tellimus.xlsx"
```

## Samples (EE, May 2026)

| File | Lines | Subtotal | VAT (24%) | Total |
|------|-------|----------|-----------|-------|
| LPA162240EE_importable.xlsx | 1 | €21.81 | €5.23 | €27.04 |
| LPA160966EE_importable.xlsx | 12 | €325.52 | €78.12 | €403.64 |

These totals are computed with the same Amflex import + client pricing formula as the web UI (`getPrice`, VAT 24% for EE).

After deploy, compare GConfig live panel with Amflex Excel import for the same configuration.

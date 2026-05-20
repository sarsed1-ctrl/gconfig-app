# Amflex pricing API (reverse-engineered)

Source: `https://amflexapi.azurewebsites.net/scripts/scripts.6fc47aae.js` (May 2026).

GConfig uses the same flow as the Amflex web app Excel import (`EXCELI ÜLESLAADIMINE`).

## Endpoints

| Step | Method | URL | Notes |
|------|--------|-----|-------|
| 1 | GET | `/api/getOrderId` | Returns JSON string order id, e.g. `"162274"` |
| 2 | POST | `/api/ImportFile/{orderId}` | Raw XLSX body (ArrayBuffer). Headers: `x-ms-blob-type: BlockBlob`, `x-ms-blob-content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| 3 | GET | `/api/GetOrderItems/{orderId}` | Parsed header + line items |

### Reference data (cached server-side)

| GET | Purpose |
|-----|---------|
| `/api/GetMaterials` | Panel materials (`RowKey` → code). EE uses `price_ee`. |
| `/api/GetFinishes` | Edge banding (`RowKey`). EE uses `price_ee`. |
| `/api/GetPlastics` | Laminated plastics. EE uses `price_ee`. |
| `/api/GetSettings/glue` | Thickness → saw/glue/CNC/press rates. EE uses `*_ee` fields. |
| `/api/GetSettings/fiber` | Grain direction labels |
| `/api/GetSettings/setting` | Global coefficients (`urgent_order_price_coefficient`, `festool_processing_price`, …) |

No authentication required for pricing endpoints (as of discovery).

## GetOrderItems response

```json
{
  "number": "",
  "date": "",
  "name": "",
  "email": "",
  "phone": "",
  "client_number": "",
  "customer_code": "",
  "items": [
    {
      "name": "Back Panel",
      "material": "77.124.D.16",
      "width": 520,
      "length": 895,
      "sideMaterialCode": { "y1": "74.35252.1.43", "y2": "", "x1": "", "x2": "" },
      "qty": 1,
      "fiber": "N",
      "processing": ""
    }
  ],
  "error": ""
}
```

If `error` is non-empty, import failed validation.

## Pricing (client-side in Amflex, replicated in GConfig proxy)

Amflex does **not** return totals from the server. After import, the SPA resolves materials/edges and runs `getPrice()` per line, then:

- **Kokku / subtotal** = sum(`getPrice(item) * qty`) + plastic waste
- **KM / VAT** = 24% for EE (`CC=EE` cookie), 21% otherwise
- **Summa kokku** = subtotal + VAT

See [`lib/amflex/pricing.js`](../lib/amflex/pricing.js).

## GConfig proxy

```
POST /api/amflex-price
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
X-Country-Code: EE   (optional, default EE)

<body: Tellimus xlsx bytes>
```

Response:

```json
{
  "subtotal": 389.37,
  "vat": 93.45,
  "total": 482.82,
  "currency": "EUR",
  "itemCount": 16,
  "lines": [{ "name": "...", "unitPrice": 12.34, "lineTotal": 24.68, "qty": 2 }]
}
```

## Excel format

Same as Amflex template `Imports_Excel.xlsx` / GConfig `assets/tellimus-template.xlsx`:

- Row 11+: A=name, C=material, D=length Y, E=width X, F=qty, G=grain (N/Y/X), H–K=edges Y1,Y2,X1,X2

## Limitations

- One pricing request = one new Amflex order id + import (no reuse).
- Latency ~1–4 s (reference data cached 1 h).
- Invalid/missing material or edge codes → 422 with Amflex error text.
- Totals match Amflex EE locale when `X-Country-Code: EE`.

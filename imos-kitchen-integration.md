# IMOS Kitchen integration (GConfig shell)

GConfig embeds the **imos iX NET** Kitchen catalog (`3034_1`) inside [`kitchen.html`](../kitchen.html). Closet and bed configurators are unchanged.

## Architecture

```
welcome.html  →  kitchen.html (GConfig chrome)
                      └── iframe → 3034.netshop.imos3d.com (IMOS Angular + VCLX + THREE.js)
```

IMOS runtime code is **not** copied into GConfig. Integration is iframe + optional `postMessage` + server helpers.

## URLs and config

| Item | Value |
|------|--------|
| IMOS tenant | `3034` (Sia AM Furnitura) |
| Kitchen catalog | `3034_1` |
| Embed URL | `https://3034.netshop.imos3d.com/app/projects/current/(sidebar:catalog/3034_1/Kitchen)` |
| Config module | [`lib/imos/embed-config.js`](../lib/imos/embed-config.js) |

Change catalog paths only in `embed-config.js` (and `deploy/` copy).

## Authentication

Users sign in **inside the IMOS iframe** (imos login page). GConfig does not store IMOS passwords.

### SSO / service account (optional)

[`api/imos-session.js`](../api/imos-session.js) is disabled by default. To experiment with server-side login:

```env
IMOS_SESSION_ENABLED=1
IMOS_API_BASE=https://3034.netshop.imos3d.com
IMOS_SERVICE_USERNAME=...
IMOS_SERVICE_PASSWORD=...
```

Contact imos support for a supported token/SSO API before production use. **Rotate any credentials that were shared in chat** and use per-user imos accounts.

## iframe embed verification

Checked `HEAD` on `https://3034.netshop.imos3d.com/app/login` — no `X-Frame-Options` or `frame-ancestors` CSP was returned (June 2026). If embedding fails in production:

1. Use **Open tab** on the error overlay
2. Ask imos to allow `gconfig.online` in embed policy

## postMessage contract

[`lib/imos/embed-bridge.js`](../lib/imos/embed-bridge.js) listens for IMOS external configurator completion:

| Field | Value |
|-------|--------|
| Allowed origin | `https://3034.netshop.imos3d.com` |
| Complete signals | `type`, `closeMessage`, or `message` = `externalConfiguratorComplete` |

On complete, GConfig shows a toast and logs to `/api/imos-bridge-log`.

## Order XML (Phase 4)

Kitchen production files are exported from IMOS as XML (`Basket.downloadXml` in IMOS UI).

Parser: [`lib/imos/xml-to-order-meta.js`](../lib/imos/xml-to-order-meta.js)

```javascript
// Browser console on kitchen.html after loading:
GConfigKitchen.pickXmlFile(); // upload XML → Telegram summary if configured
```

Notify API: `POST /api/imos-order-notify` with `{ meta: { source: 'imos-kitchen', ... } }`  
Uses same `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` as closet orders.

**Note:** XML shape varies by catalog. Update the parser when you have a real Kitchen order sample from tenant `3034`.

## Tests

```bash
node scripts/test-imos-embed-bridge.js
node scripts/test-imos-xml-to-order-meta.js
```

## Service worker

Cache bumped to `gconfig-v132`. IMOS cross-origin assets are **not** precached. `kitchen.html` uses network-first HTML like other pages.

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Blank iframe after 12s | Click **Open IMOS**; check login; verify embed headers |
| Login loop | Clear cookies for `netshop.imos3d.com`; use per-user account |
| No Telegram notify | Set Telegram env vars on Vercel; XML meta must have `source: imos-kitchen` |
| Price differs from closet Amflex | Expected — Kitchen uses IMOS pricing, closets use Amflex/Tellimus |

## Files

| File | Purpose |
|------|---------|
| `kitchen.html` | Shell UI |
| `lib/imos/embed-config.js` | URLs, origins |
| `lib/imos/embed-bridge.js` | postMessage bridge |
| `lib/imos/xml-to-order-meta.js` | XML → order metadata |
| `api/imos-bridge-log.js` | Audit log (optional) |
| `api/imos-order-notify.js` | Telegram summary for Kitchen XML |
| `api/imos-session.js` | Disabled SSO stub |

Mirror all of the above under `deploy/` when publishing.

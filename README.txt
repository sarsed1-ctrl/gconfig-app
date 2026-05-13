GConfig — Deployment Package
============================

This folder contains the complete static web app, ready to upload.

What to upload
--------------
Upload these files to the document root of your hosting (the directory that is
served at https://your-domain/ ). The root listing should include at least:

    /index.html
    /welcome.html
    /configurator.html
    /beds.html
    /app.html
    /manifest.json
    /sw.js

Legacy note: some older packages used a file named "index (1).html" (with a
space) instead of configurator.html. If you still use that name, keep it and
point beds.html to ./index%20(1).html?mode=beds instead.

IMPORTANT: beds.html MUST load the unified configurator with BEDS mode, e.g.:

    ./configurator.html?mode=beds

Do NOT point the iframe at ./index.html alone (that file is only the short
redirect to welcome.html).

Entry points
------------
- /                  -> index.html redirects to welcome.html (landing).
- /welcome.html      -> landing page with cards (Closets / Beds / ...).
- /configurator.html -> Closets / cabinet configurator (+ ?mode=beds for beds).
- /beds.html         -> Beds page (iframes configurator.html?mode=beds).
- /app.html          -> Alternative app entry; registers the Service
                        Worker and references manifest.json (PWA).

Optional alternate layout (same repository)
---------------------------------------------
If the folder GCONFIG/ is present, open /GCONFIG/index.html for the split
layout; it is independent of the flat root files above.

All HTML pages, manifest.json and sw.js use ONLY relative paths
(./welcome.html, ./configurator.html, ./app.html, manifest.json, sw.js),
so the site works correctly as long as the files above are at the
document root. No path edits are required after upload.

External CDN dependencies
-------------------------
The pages also load these scripts from public CDNs at runtime:

    cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/...
    cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/...
    cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/...
    cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/...

The server only needs to host the local files; the browser fetches
these from the CDN. The Service Worker also pre-caches the first
three so the app works offline after the first visit.

HTTPS requirement (Service Worker / PWA)
----------------------------------------
sw.js is a Service Worker. Browsers will register a Service Worker
ONLY on a secure origin:

    - https://your-domain/        (production: HTTPS is REQUIRED)
    - http://localhost             (local testing is allowed)

Without HTTPS, the site still works as a regular web page, but the
offline cache and "Install as app" (PWA) features will be disabled.

If you are NOT serving over HTTPS, registration silently fails (the
code uses .catch(() => {})) and nothing breaks.

Local testing
-------------
Open a terminal in this folder and run any static server, e.g.:

    py -m http.server 8000
    # then open http://localhost:8000/

Do not open the .html files via file:// — the Service Worker, the
manifest, and some fetch() calls require an http(s):// origin.

Not included on purpose
-----------------------
- .git, .cursor, .claude         (developer-only metadata)
- greenroot-shop/                (separate project, not linked from
                                   the main app)
- GConfig_mobile.apk / .zip      (Android packages, not needed for the
                                   web deployment)

That's it — upload the files above and the app is live.

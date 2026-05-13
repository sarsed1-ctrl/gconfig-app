GConfig — Deployment Package
============================

This folder contains the complete static web app, ready to upload.

What to upload
--------------
Upload the CONTENTS of this `deploy/` folder (not the folder itself) to
the document root of your hosting (the directory that is served at
https://your-domain/ ). After upload, the root listing on the server
should look exactly like this:

    /index.html
    /welcome.html
    /index (1).html        <-- filename contains a space and parentheses
    /beds.html
    /app.html
    /manifest.json
    /sw.js

IMPORTANT: keep the original filename "index (1).html" exactly as is
(with the space and the parentheses). Internal links use the URL-encoded
form "./index%20(1).html"; do NOT rename it.

Entry points
------------
- /                  -> index.html redirects to welcome.html (landing).
- /welcome.html      -> landing page with cards (Closets / Beds / ...).
- /index (1).html    -> Closets / Cabinet configurator.
- /beds.html         -> Beds configurator (iframes index (1).html).
- /app.html          -> Alternative app entry; registers the Service
                        Worker and references manifest.json (PWA).

All HTML pages, manifest.json and sw.js use ONLY relative paths
(./welcome.html, ./index%20(1).html, ./app.html, manifest.json, sw.js),
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

That's it — upload the seven files above and the app is live.

# GreenRoot — Plant Fertilizer Shop

A minimal, self-contained static storefront for selling plant fertilizers.  
Built with vanilla HTML, CSS, and JavaScript — no frameworks, no build tools.

---

## File Structure

```
greenroot-shop/
├── index.html      Home page (hero, features, CTA)
├── catalog.html    Product grid
├── product.html    Product detail page (?id=1 … ?id=7)
├── admin.html      Admin panel (password-protected)
├── style.css       All styles
├── main.js         Product data, order modal, Telegram logic
├── admin.js        Admin auth and product editor
└── README.md       This file
```

---

## 1 — Set Up the Telegram Bot

Orders are delivered as Telegram messages. You need a bot and a chat to send them to.

### Create a bot
1. Open Telegram and search for **@BotFather**.
2. Send `/newbot` and follow the prompts.
3. Copy the **token** it gives you (looks like `123456789:ABCdef...`).

### Get your Chat ID
1. Add your new bot to the Telegram group (or chat) where you want orders to arrive.
2. Send any message in that chat.
3. Open this URL in a browser (replace `YOUR_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_TOKEN/getUpdates
   ```
4. Find `"chat":{"id": ...}` in the response. That number is your **Chat ID**.  
   For a private chat with yourself, start a conversation with the bot first, then check the URL above.

### Add the credentials to main.js
Open `main.js` and replace the two placeholders at the very top:

```js
const BOT_TOKEN = 'YOUR_BOT_TOKEN'; // ← paste your token here
const CHAT_ID   = 'YOUR_CHAT_ID';  // ← paste your chat ID here
```

---

## 2 — Change the Admin Password

Open `admin.js` and change the password at the top of the file:

```js
const ADMIN_PASSWORD = 'admin123'; // ← change this before publishing
```

> **Security note:** This is a client-side check — anyone who inspects the
> source can find the password. Keep the `/admin.html` URL out of public
> navigation and do not use a password you reuse elsewhere.

---

## 3 — Rename the Store (optional)

Search for `GreenRoot` across all `.html` files and replace it with your store name.  
Update the `<meta name="description">` tags in each HTML file too.

---

## 4 — Test Locally

Open `index.html` directly in a browser — no server needed.

- Catalog and product pages render from JavaScript; they work with `file://` URLs.
- The order form works in **dev mode** when the token is still `YOUR_BOT_TOKEN`:  
  it simulates a successful send and logs the message to the browser console.
- The admin panel password is checked client-side; login persists for the browser session.

---

## 5 — Deploy

### GitHub Pages (free)
1. Push the `greenroot-shop/` folder contents to a GitHub repository.
2. Go to **Settings → Pages**, set source to the `main` branch, root folder.
3. Your site is live at `https://your-username.github.io/your-repo/`.

### Netlify (drag & drop, free)
1. Go to [netlify.com](https://netlify.com) and sign in.
2. Drag the entire `greenroot-shop/` folder onto the Netlify dashboard.
3. Done — Netlify gives you a live URL instantly.

### Any static host
Upload all files from `greenroot-shop/` to the root of your hosting provider.  
No server-side configuration is required.

---

## 6 — Edit Products via Admin Panel

1. Navigate to `/admin.html`.
2. Enter the admin password.
3. Edit the **name**, **short description**, and **price** of any product.
4. Click **Save All Changes** — changes are written to `localStorage`.
5. The catalog and product pages read from `localStorage` automatically.
6. Click **Reset to Defaults** to discard all local edits.

> Changes stored in `localStorage` are browser-specific. If you deploy to a
> static host and want persistent edits, update the defaults directly in
> `main.js` under `DEFAULT_PRODUCTS` and redeploy.

---

## Telegram Message Format

Each order arrives as:

```
🌿 New Order!
Product: Terra GROW
Name: Maria Schmidt
Phone: +49 170 1234567
Quantity: 2
Comment: Please call before delivery.
```

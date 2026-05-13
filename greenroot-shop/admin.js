/* ============================================================
   admin.js — GreenRoot Admin Panel

   ⚠️  SECURITY NOTE: client-side password only. Keep the
   admin.html URL out of public navigation.
   ============================================================ */

const ADMIN_PASSWORD = 'Gardenado'; /* ← change before publishing */

/* ---- DOM REFS --------------------------------------------- */
const gateEl      = document.getElementById('admin-gate');
const panelEl     = document.getElementById('admin-panel');
const loginForm   = document.getElementById('login-form');
const loginError  = document.getElementById('login-error');
const productList = document.getElementById('admin-product-list');
const saveBtn     = document.getElementById('save-all-btn');
const resetBtn    = document.getElementById('reset-btn');
const statusEl    = document.getElementById('save-status');

/* ---- BOT WIZARD STATE ------------------------------------- */
let wizardState = null; /* { step: 'name'|'shortDesc'|'price'|'stock', data: {} } */

/* ---- AUTH ------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('gr_admin_auth') === '1') showPanel();

  loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const entered = document.getElementById('admin-password').value;
    if (entered === ADMIN_PASSWORD) {
      sessionStorage.setItem('gr_admin_auth', '1');
      loginError.textContent = '';
      showPanel();
    } else {
      loginError.textContent = 'Incorrect password. Please try again.';
      document.getElementById('admin-password').value = '';
      document.getElementById('admin-password').focus();
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('gr_admin_auth');
    stopBotPolling();
    panelEl.hidden = true;
    gateEl.hidden  = false;
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-password').focus();
  });

  saveBtn.addEventListener('click', saveAllProducts);

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset all products to factory defaults? This discards saved changes.')) return;
    localStorage.removeItem('greenroot_products');
    renderAdminProducts();
    showStatus('✓ Products reset to defaults.', 'success');
  });

  document.getElementById('bot-toggle-btn').addEventListener('click', () => {
    if (isPolling) stopBotPolling(); else startBotPolling();
  });

  /* Add Product form */
  const addForm = document.getElementById('add-product-form');
  if (addForm) {
    addForm.addEventListener('submit', e => {
      e.preventDefault();
      const npError = document.getElementById('np-error');
      npError.textContent = '';

      const name      = document.getElementById('np-name').value.trim();
      const shortDesc = document.getElementById('np-shortdesc').value.trim();
      const desc      = document.getElementById('np-desc').value.trim();
      const usage     = document.getElementById('np-usage').value.trim();
      const price     = document.getElementById('np-price').value.trim();
      const rawStock  = document.getElementById('np-stock').value.trim();
      const emoji     = document.getElementById('np-emoji').value.trim();
      const stock     = rawStock === '' ? null : Math.max(0, parseInt(rawStock, 10) || 0);

      if (!name)  { npError.textContent = 'Product name is required.'; return; }
      if (!price) { npError.textContent = 'Price is required.'; return; }

      const product = createProduct({ name, shortDesc, description: desc, usage, price, stock, emoji });
      renderAdminProducts();
      showStatus(`✓ "${product.name}" added (ID #${product.id}).`, 'success');
      addForm.reset();
    });
  }
});

function showPanel() {
  gateEl.hidden  = true;
  panelEl.hidden = false;
  renderAdminProducts();
}

/* ---- PRODUCT EDITOR --------------------------------------- */

function renderAdminProducts() {
  const products = getProducts();
  productList.innerHTML = '';

  products.forEach((product, index) => {
    const stockVal = (product.stock === null || product.stock === undefined) ? '' : product.stock;
    const item = document.createElement('div');
    item.className = 'admin-product-item';
    item.dataset.index = index;
    item.innerHTML = `
      <div class="admin-product-label-row">
        <p class="admin-product-label">#${product.id} — ${escapeHtml(product.name)}</p>
        <button class="btn-danger admin-delete-btn" type="button">Delete</button>
      </div>
      <div class="admin-fields">
        <div>
          <label for="a-name-${index}">Name</label>
          <input type="text" id="a-name-${index}" class="admin-name"
                 value="${escapeHtml(product.name)}" required maxlength="80" />
        </div>
        <div>
          <label for="a-desc-${index}">Short Description</label>
          <textarea id="a-desc-${index}" class="admin-desc"
                    maxlength="200">${escapeHtml(product.shortDesc)}</textarea>
        </div>
        <div>
          <label for="a-price-${index}">Price</label>
          <input type="text" id="a-price-${index}" class="admin-price"
                 value="${escapeHtml(product.price)}" placeholder="€0.00" maxlength="20" />
        </div>
        <div>
          <label for="a-stock-${index}">
            Stock
            <span class="label-hint">(blank&nbsp;=&nbsp;∞)</span>
          </label>
          <input type="number" id="a-stock-${index}" class="admin-stock"
                 value="${stockVal}" min="0" placeholder="∞" />
        </div>
      </div>`;
    item.querySelector('.admin-delete-btn').addEventListener('click', () => {
      if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
      deleteProduct(product.id);
      renderAdminProducts();
      showStatus(`✓ "${product.name}" deleted.`, 'success');
    });
    productList.appendChild(item);
  });
}

function saveAllProducts() {
  const products = getProducts();
  let hasError   = false;

  document.querySelectorAll('.admin-product-item').forEach(item => {
    const index = parseInt(item.dataset.index, 10);
    const name  = item.querySelector('.admin-name').value.trim();
    const desc  = item.querySelector('.admin-desc').value.trim();
    const price = item.querySelector('.admin-price').value.trim();
    const rawStock = item.querySelector('.admin-stock').value.trim();
    const stock = rawStock === '' ? null : Math.max(0, parseInt(rawStock, 10) || 0);

    if (!name) { item.querySelector('.admin-name').focus(); hasError = true; return; }

    products[index] = { ...products[index], name, shortDesc: desc, price, stock };
  });

  if (hasError) { showStatus('✗ Product name cannot be empty.', 'error'); return; }

  try {
    saveProducts(products);
    showStatus('✓ All changes saved.', 'success');
    renderAdminProducts();
  } catch (e) {
    console.error(e);
    showStatus('✗ Could not save. Check browser storage settings.', 'error');
  }
}

/* ---- BOT KEYBOARD ----------------------------------------- */

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '📦 Склад' }, { text: '🛒 Заказы' }],
    [{ text: '✏️ Изменить склад' }],
  ],
  resize_keyboard: true,
  persistent: true,
};

/* ---- BOT POLLING ------------------------------------------ */
/*
   How it works:
   — This page polls getUpdates from the Telegram Bot API every 10 s.
   — Only messages from CHAT_ID are processed.
   — Available commands:
       /stock               → bot replies with current stock table
       /setstock [id] [qty] → set stock to exact qty
       /setstock [id] +[n]  → add n units
       /setstock [id] -[n]  → subtract n units
       /setstock all [qty]  → set all products to qty
       /help                → bot replies with command list
*/

let pollTimer  = null;
let pollOffset = parseInt(localStorage.getItem('gr_bot_offset') || '0', 10);
let isPolling  = false;

async function startBotPolling() {
  if (isPolling) return;

  if (BOT_TOKEN === 'YOUR_BOT_TOKEN') {
    setBotStatus('error', 'Configure BOT_TOKEN in main.js first');
    return;
  }

  /* On first run: skip all existing messages, start from now */
  if (!localStorage.getItem('gr_bot_offset')) {
    await initPollOffset();
  }

  isPolling = true;
  setBotStatus('active', 'Listening…');
  document.getElementById('bot-toggle-btn').textContent = 'Stop';

  await sendTelegramMessage('✅ GreenRoot bot started. Use the buttons below.', MAIN_KEYBOARD);
  await doPoll(); /* immediate first tick */
  pollTimer = setInterval(doPoll, 10000);
}

function stopBotPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  isPolling = false;
  setBotStatus('stopped', 'Stopped');
  document.getElementById('bot-toggle-btn').textContent = 'Start';
}

async function initPollOffset() {
  try {
    const url  = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=-1&limit=1`;
    const data = await (await fetch(url)).json();
    if (data.ok && data.result.length > 0) {
      pollOffset = data.result[data.result.length - 1].update_id + 1;
    } else {
      pollOffset = 0;
    }
    localStorage.setItem('gr_bot_offset', pollOffset);
  } catch { pollOffset = 0; }
}

async function doPoll() {
  try {
    const url  = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${pollOffset}&limit=20&timeout=0`;
    const data = await (await fetch(url)).json();

    if (!data.ok) {
      setBotStatus('error', 'API error: ' + (data.description || 'unknown'));
      return;
    }

    for (const update of data.result) {
      pollOffset = update.update_id + 1;
      localStorage.setItem('gr_bot_offset', pollOffset);

      const msg = update.message;
      if (!msg || !msg.text) continue;
      if (String(msg.chat.id) !== String(CHAT_ID)) continue; /* ignore other chats */

      await handleBotCommand(msg.text.trim());
    }

    setBotStatus('active', 'Active — ' + new Date().toLocaleTimeString());
  } catch (err) {
    setBotStatus('error', 'Network error');
    console.warn('Bot poll error:', err);
  }
}

async function handleBotCommand(text) {
  appendBotLog(text);

  /* /cancel — abort active wizard */
  if (/^\/cancel$/i.test(text)) {
    if (wizardState) {
      wizardState = null;
      await sendTelegramMessage('❌ Wizard cancelled.', MAIN_KEYBOARD);
    }
    return;
  }

  /* ✏️ Изменить склад button */
  if (text === '✏️ Изменить склад') {
    const lines = getProducts().map(p => {
      const qty = (p.stock === null || p.stock === undefined) ? '∞' : p.stock;
      return `  #${p.id} ${p.emoji} ${p.name}: ${qty}`;
    }).join('\n');
    wizardState = { step: 'editStock_id', data: {} };
    await sendTelegramMessage('✏️ Edit stock\n\n' + lines + '\n\nSend the product ID:');
    return;
  }

  /* ---- Active wizard: route next reply into wizard steps ---- */
  if (wizardState) {
    await handleWizardStep(text);
    return;
  }

  /* /help */
  if (/^\/help$/i.test(text)) {
    await sendTelegramMessage(
      '📋 GreenRoot Bot Commands\n\n' +
      '/stock — Show all stock levels\n' +
      '/orders — Show recent orders\n' +
      '/setstock [id] [qty|+n|-n] — Update stock\n' +
      '/setstock all [qty] — Set every product\n' +
      '/prices — Show all current prices\n' +
      '/listproducts — Show all products with IDs\n' +
      '/addproduct — Add a new product (4-step wizard)\n' +
      '/deleteproduct [id] — Delete a product\n' +
      '/cancel — Cancel active wizard',
      MAIN_KEYBOARD
    );
    return;
  }

  /* 📦 Склад button  OR  /stock command */
  if (text === '📦 Склад' || /^\/stock$/i.test(text)) {
    const products = getProducts();
    const lines = products.map(p => {
      const s = p.stock;
      if (s === null || s === undefined) return `  ∞  #${p.id} ${p.name}`;
      const icon = s === 0 ? '❌' : s <= 5 ? '⚠️' : '✅';
      return `  ${icon} #${p.id} ${p.name}: ${s} units`;
    }).join('\n');
    await sendTelegramMessage('📦 Stock report:\n\n' + lines, MAIN_KEYBOARD);
    return;
  }

  /* 🛒 Заказы button  OR  /orders command */
  if (text === '🛒 Заказы' || /^\/orders$/i.test(text)) {
    let orders = [];
    try { orders = JSON.parse(localStorage.getItem('greenroot_orders') || '[]'); } catch {}

    if (orders.length === 0) {
      await sendTelegramMessage('🛒 No orders yet.', MAIN_KEYBOARD);
      return;
    }

    const lines = orders.slice(0, 10).map((o, i) => {
      const d    = new Date(o.ts);
      const date = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const items = o.items.map(it => `${it.name} ×${it.qty}`).join(', ');
      return `${i + 1}. ${date} — ${o.name} (${o.phone})\n   ${items}\n   Total: ${o.total}`;
    }).join('\n\n');

    await sendTelegramMessage(`🛒 Last ${Math.min(orders.length, 10)} order(s):\n\n` + lines, MAIN_KEYBOARD);
    return;
  }

  /* /prices */
  if (/^\/prices$/i.test(text)) {
    const lines = getProducts().map(p => `  #${p.id} ${p.name}: ${p.price}`).join('\n');
    await sendTelegramMessage('💰 Prices:\n\n' + lines, MAIN_KEYBOARD);
    return;
  }

  /* /listproducts */
  if (/^\/listproducts$/i.test(text)) {
    const lines = getProducts().map(p => `  #${p.id} ${p.emoji} ${p.name} — ${p.price}`).join('\n');
    await sendTelegramMessage('🗂 Product list:\n\n' + lines, MAIN_KEYBOARD);
    return;
  }

  /* /addproduct — start wizard */
  if (/^\/addproduct$/i.test(text)) {
    wizardState = { step: 'name', data: {} };
    await sendTelegramMessage('➕ New Product — Step 1 of 4\n\nSend the product name\n(or /cancel to abort):');
    return;
  }

  /* /deleteproduct [id] */
  const delMatch = text.match(/^\/deleteproduct\s+(\d+)$/i);
  if (delMatch) {
    const id      = parseInt(delMatch[1], 10);
    const product = getProducts().find(p => p.id === id);
    if (!product) {
      await sendTelegramMessage(`❌ Product #${id} not found.\nSend /listproducts to see all IDs.`, MAIN_KEYBOARD);
      return;
    }
    deleteProduct(id);
    renderAdminProducts();
    await sendTelegramMessage(`🗑 "${product.name}" (ID #${id}) has been deleted.`, MAIN_KEYBOARD);
    showStatus(`✓ Bot: "${product.name}" deleted.`, 'success');
    return;
  }

  /* /setstock all [qty] */
  const allMatch = text.match(/^\/setstock\s+all\s+(\d+)$/i);
  if (allMatch) {
    const qty = parseInt(allMatch[1], 10);
    const products = getProducts();
    products.forEach(p => { p.stock = qty; });
    saveProducts(products);
    renderAdminProducts();
    await sendTelegramMessage(`✅ All products set to ${qty} units`, MAIN_KEYBOARD);
    showStatus(`✓ Bot: all stock → ${qty}`, 'success');
    return;
  }

  /* /setstock [id] [qty|+n|-n] */
  const setMatch = text.match(/^\/setstock\s+(\d+)\s+([+\-]?\d+)$/);
  if (setMatch) {
    const id       = parseInt(setMatch[1], 10);
    const rawQty   = setMatch[2];
    const products = getProducts();
    const product  = products.find(p => p.id === id);

    if (!product) {
      await sendTelegramMessage(`❌ Product #${id} not found.\nSend /listproducts to see all IDs.`, MAIN_KEYBOARD);
      return;
    }

    let newQty;
    if (rawQty.startsWith('+') || rawQty.startsWith('-')) {
      newQty = Math.max(0, (product.stock || 0) + parseInt(rawQty, 10));
    } else {
      newQty = Math.max(0, parseInt(rawQty, 10));
    }

    product.stock = newQty;
    saveProducts(products);
    renderAdminProducts();

    const icon = newQty === 0 ? '❌' : newQty <= 5 ? '⚠️' : '✅';
    await sendTelegramMessage(`${icon} ${product.name}: stock updated to ${newQty} units`, MAIN_KEYBOARD);
    showStatus(`✓ Bot: ${product.name} stock → ${newQty}`, 'success');
    return;
  }
}

/* ---- BOT WIZARD ------------------------------------------- */

async function handleWizardStep(text) {
  const { step, data } = wizardState;

  if (step === 'name') {
    if (!text.trim()) { await sendTelegramMessage('⚠️ Name cannot be empty. Try again:'); return; }
    data.name = text.trim();
    wizardState.step = 'shortDesc';
    await sendTelegramMessage(
      `✅ Name: "${data.name}"\n\n` +
      '➕ Step 2 of 4 — Short description\n(one sentence, shown on catalog card)\n\nSend text or /skip:'
    );
    return;
  }

  if (step === 'shortDesc') {
    data.shortDesc = /^\/skip$/i.test(text) ? '' : text.trim();
    wizardState.step = 'price';
    await sendTelegramMessage(
      '➕ Step 3 of 4 — Price\n\nExample: €14.90\n\nSend the price (or /skip to leave blank):'
    );
    return;
  }

  if (step === 'price') {
    data.price = /^\/skip$/i.test(text) ? '' : text.trim();
    wizardState.step = 'stock';
    await sendTelegramMessage(
      '➕ Step 4 of 4 — Stock quantity\n\nSend a number or /skip for unlimited:'
    );
    return;
  }

  if (step === 'stock') {
    const rawStock = /^\/skip$/i.test(text) ? '' : text.trim();
    data.stock = rawStock === '' ? null : Math.max(0, parseInt(rawStock, 10) || 0);

    const product = createProduct(data);
    wizardState = null;
    renderAdminProducts();

    const stockLabel = product.stock === null ? '∞ unlimited' : `${product.stock} units`;
    await sendTelegramMessage(
      `✅ Product added!\n\n` +
      `${product.emoji} #${product.id} ${product.name}\n` +
      `Price: ${product.price || '—'}\n` +
      `Stock: ${stockLabel}`,
      MAIN_KEYBOARD
    );
    showStatus(`✓ Bot: "${product.name}" added (ID #${product.id}).`, 'success');
    return;
  }
}

/* ---- BOT UI HELPERS --------------------------------------- */

function setBotStatus(state, text) {
  const dot  = document.getElementById('bot-status-dot');
  const txt  = document.getElementById('bot-status-text');
  if (!dot || !txt) return;
  dot.className   = `bot-status-dot bot-status-${state}`;
  txt.textContent = text;
}

function appendBotLog(cmdText) {
  const log = document.getElementById('bot-log');
  if (!log) return;

  const empty = log.querySelector('.bot-log-empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = 'bot-log-entry';
  entry.innerHTML = `
    <span class="bot-log-time">${new Date().toLocaleTimeString()}</span>
    <code class="bot-log-cmd">${escapeHtml(cmdText)}</code>`;
  log.insertBefore(entry, log.firstChild);

  /* Keep only last 10 entries */
  while (log.children.length > 10) log.removeChild(log.lastChild);
}

/* ---- UTILITY --------------------------------------------- */

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className   = `save-status ${type}`;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className   = 'save-status';
  }, 3500);
}

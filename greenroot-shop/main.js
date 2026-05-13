/* ============================================================
   main.js — GreenRoot Plant Fertilizer Store
   ============================================================ */

/* ---- TELEGRAM CONFIG -------------------------------------- */
const BOT_TOKEN = '8625264726:AAFHxTjUp_N0iupAGLcq6hBsCfVnMIc2bO4';
const CHAT_ID   = '904669192';

/* ---- PRODUCT DATA ----------------------------------------- */
const DEFAULT_PRODUCTS = [
  {
    id: 1, emoji: '🌱', gradient: '#e8f4e8', stock: null,
    name: 'Terra GROW',
    shortDesc: 'Balanced nitrogen-rich formula for vigorous vegetative growth.',
    description:
      'Terra GROW provides your plants with an optimal nitrogen-rich blend throughout the vegetative phase. ' +
      'It supports strong stems, lush foliage, and robust root development. Suitable for all soil and ' +
      'substrate types, it is gentle enough for daily use yet powerful enough to push plants to their ' +
      'full vegetative potential.',
    usage:
      'Mix 2–5 ml per litre of water. Apply every watering during the growth phase. ' +
      'Adjust the pH of your nutrient solution to 6.0–6.5 before feeding.',
    price: '€14.90',
  },
  {
    id: 2, emoji: '🌺', gradient: '#f3eaff', stock: null,
    name: 'Terra BLOOM',
    shortDesc: 'Phosphorus-potassium rich formula to fuel prolific flowering.',
    description:
      'Terra BLOOM switches your plants into full flowering mode. The elevated phosphorus and potassium ' +
      'ratio encourages abundant blossom formation, enhanced aroma, and heavier, denser yields. ' +
      'Formulated to work seamlessly after a vegetative phase on Terra GROW.',
    usage:
      'Mix 2–5 ml per litre of water. Switch to BLOOM as soon as the first flowers appear. ' +
      'Maintain pH between 6.0 and 6.5 for optimal nutrient uptake.',
    price: '€14.90',
  },
  {
    id: 3, emoji: '🪴', gradient: '#ebf2e6', stock: null,
    name: 'Plagron LightMix',
    shortDesc: 'Airy peat-based substrate with gentle starter nutrients.',
    description:
      'Plagron LightMix is a lightly fertilised, peat-based growing medium ideal for seedlings, cuttings, ' +
      'and plants that need precise nutrient control. Its open, airy structure promotes excellent drainage ' +
      'and high oxygen levels at the roots, reducing the risk of overwatering and root rot.',
    usage:
      'Fill pots with LightMix and begin adding liquid nutrients 1–2 weeks after potting, ' +
      'once the starter charge has been consumed. Water only when the top 2 cm of substrate feels dry.',
    price: '€18.50',
  },
  {
    id: 4, emoji: '🍯', gradient: '#fde8e8', stock: null,
    name: 'Sugar Royal',
    shortDesc: 'Carbohydrate supplement for richer flavour and stronger yields.',
    description:
      'Sugar Royal delivers a proprietary blend of natural sugars and trace elements that feeds the ' +
      'beneficial microorganisms in your root zone and supplies plants with readily available carbon energy. ' +
      'The result is noticeably improved taste, aroma, and overall yield quality at harvest.',
    usage:
      'Add 2–5 ml per litre during the last 3–4 weeks of the flowering phase. ' +
      'Combine with your regular nutrient schedule. Compatible with all base nutrients.',
    price: '€16.90',
  },
  {
    id: 5, emoji: '⚗️', gradient: '#e8edf8', stock: null,
    name: 'PK 13-14',
    shortDesc: 'Concentrated phosphorus-potassium booster for peak bloom.',
    description:
      'PK 13-14 is a powerful bloom-stage additive that delivers a targeted spike of phosphorus (13%) and ' +
      'potassium (14%) precisely when flower sites are forming. It drives maximum bud density, resin ' +
      'production, and overall biomass in the final flowering weeks.',
    usage:
      'Use at 1–2 ml per litre for 1–2 weeks during mid to late flowering. ' +
      'Do not use alongside other dedicated PK boosters to avoid nutrient lockout.',
    price: '€12.50',
  },
  {
    id: 6, emoji: '🌿', gradient: '#e6f4f0', stock: null,
    name: 'AZOS Extreme Gardening',
    shortDesc: 'Beneficial nitrogen-fixing bacteria for explosive growth.',
    description:
      'AZOS contains naturally occurring Azospirillum brasilense bacteria that colonise the root zone and ' +
      'fix atmospheric nitrogen, making it directly available to your plants. It dramatically speeds up ' +
      'transplant recovery, increases root mass, and boosts overall growth rates in a completely natural way.',
    usage:
      'Dip roots in an AZOS solution (5 g/L) at transplant, or drench the root zone with ' +
      '2.5 g per litre weekly during the growth phase. Safe alongside most liquid nutrients.',
    price: '€24.90',
  },
  {
    id: 7, emoji: '🧪', gradient: '#ecf2e8', stock: null,
    name: 'PH+ / PH-',
    shortDesc: 'Precise pH adjustment for optimal nutrient uptake.',
    description:
      'Keeping your nutrient solution in the correct pH range is essential for healthy nutrient uptake. ' +
      'PH+ raises pH; PH- lowers it. Both are highly concentrated — only a few drops per litre are needed. ' +
      'Suitable for soil (6.0–6.5), coco (5.8–6.2), and hydroponic (5.5–6.0) grows.',
    usage:
      'Always pH your nutrient solution after adding nutrients and supplements. ' +
      'Add drops of PH+ or PH- to the mixed solution, stir, and re-test until your target is reached. ' +
      'Store bottles upright in a cool, dark place.',
    price: '€8.90',
  },
];

/* ---- PRODUCT PALETTE (for newly created products) --------- */

const PRODUCT_GRADIENTS = [
  '#e8f4e8','#f3eaff','#ebf2e6','#fde8e8',
  '#e8edf8','#e6f4f0','#ecf2e8','#fef3e8',
  '#e8f0fe','#fde8f3',
];
const PRODUCT_EMOJIS = ['🌱','🌺','🪴','🍯','⚗️','🌿','🧪','🌸','🍃','💧'];

/* ---- PRODUCT DATA ACCESS ---------------------------------- */

function getProducts() {
  try {
    const stored = localStorage.getItem('greenroot_products');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map(p => {
        const def = DEFAULT_PRODUCTS.find(d => d.id === p.id);
        return def ? { ...def, ...p } : p;
      });
    }
  } catch (e) {
    console.warn('Could not read products from localStorage:', e);
  }
  return DEFAULT_PRODUCTS;
}

function saveProducts(products) {
  localStorage.setItem('greenroot_products', JSON.stringify(products));
}

function createProduct({ name, shortDesc = '', description = '', usage = '', price = '', stock = null, emoji = '' }) {
  const products = getProducts();
  const maxId    = products.reduce((m, p) => Math.max(m, p.id), 0);
  const idx      = products.length % PRODUCT_GRADIENTS.length;
  const product  = {
    id:       maxId + 1,
    emoji:    emoji || PRODUCT_EMOJIS[products.length % PRODUCT_EMOJIS.length],
    gradient: PRODUCT_GRADIENTS[idx],
    stock,
    name,
    shortDesc,
    description,
    usage,
    price,
  };
  products.push(product);
  saveProducts(products);
  return product;
}

function deleteProduct(id) {
  saveProducts(getProducts().filter(p => p.id !== id));
}

/* ---- CART STORAGE ----------------------------------------- */

function getCart() {
  try {
    return JSON.parse(localStorage.getItem('greenroot_cart') || '[]');
  } catch {
    return [];
  }
}

function _saveCart(cart) {
  localStorage.setItem('greenroot_cart', JSON.stringify(cart));
}

function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.qty, 0);
}

function getCartTotal() {
  return getCart().reduce((sum, item) => {
    const price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
    return sum + price * item.qty;
  }, 0);
}

/* ---- CART OPERATIONS -------------------------------------- */

/**
 * Adds one unit of a product to the cart.
 * Returns false (with no-op) if the product is out of stock or
 * the cart already contains the maximum available quantity.
 */
function addToCart(productId) {
  const product = getProducts().find(p => p.id === productId);
  if (!product) return false;

  const cart    = getCart();
  const inCart  = cart.find(i => i.id === productId);
  const cartQty = inCart?.qty ?? 0;

  /* Stock limit check */
  if (typeof product.stock === 'number' && cartQty >= product.stock) return false;

  if (inCart) {
    inCart.qty++;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
  }

  _saveCart(cart);
  updateCartBadge();
  animateBadge();
  return true;
}

function removeFromCart(productId) {
  _saveCart(getCart().filter(i => i.id !== productId));
  updateCartBadge();
  renderCartPanel();
}

function setCartQty(productId, qty) {
  if (qty < 1) { removeFromCart(productId); return; }

  /* Cap at stock if tracked */
  const product = getProducts().find(p => p.id === productId);
  const capped  = (product && typeof product.stock === 'number')
    ? Math.min(qty, product.stock)
    : qty;

  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.qty = capped;
  _saveCart(cart);
  renderCartPanel();
}

function clearCart() {
  localStorage.removeItem('greenroot_cart');
  updateCartBadge();
}

/* ---- STOCK HELPERS ---------------------------------------- */

/** Returns a stock badge HTML string (empty if stock is untracked). */
function stockBadge(stock) {
  if (stock === null || stock === undefined) return '';
  if (stock === 0)  return '<span class="stock-badge stock-out">Out of stock</span>';
  if (stock <= 5)   return `<span class="stock-badge stock-low">Only ${stock} left!</span>`;
  return '<span class="stock-badge stock-ok">In stock</span>';
}

/* ---- CART UI ---------------------------------------------- */

function initCart() {
  /* Inject cart button into nav */
  const nav = document.querySelector('.nav');
  if (nav) {
    const btn = document.createElement('button');
    btn.className = 'cart-btn';
    btn.id = 'cart-toggle-btn';
    btn.setAttribute('aria-label', 'Open shopping cart');
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
      Cart
      <span class="cart-badge" id="cart-badge" hidden aria-live="polite">0</span>
    `;
    nav.appendChild(btn);
    btn.addEventListener('click', openCartPanel);
  }

  /* Overlay */
  const overlay = document.createElement('div');
  overlay.id = 'cart-overlay';
  overlay.className = 'cart-overlay';
  overlay.addEventListener('click', closeCartPanel);
  document.body.appendChild(overlay);

  /* Panel */
  const panel = document.createElement('div');
  panel.id = 'cart-panel';
  panel.className = 'cart-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Shopping cart');
  panel.innerHTML = `
    <div class="cart-panel-header">
      <h2 class="cart-panel-title">Cart</h2>
      <button class="cart-close" id="cart-close-btn" aria-label="Close cart">&#x2715;</button>
    </div>
    <div class="cart-items" id="cart-items"></div>
    <div class="cart-footer" id="cart-footer"></div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#cart-close-btn').addEventListener('click', closeCartPanel);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closeCartPanel();
  });

  /* "Add to Cart" delegation */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-cart-id]');
    if (!btn || btn.disabled) return;

    const added = addToCart(parseInt(btn.dataset.cartId, 10));

    if (added) {
      const orig = btn.textContent.trim();
      btn.textContent = 'Added ✓';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1200);
    } else {
      /* Stock limit reached */
      const orig = btn.textContent.trim();
      btn.textContent = 'Max reached';
      setTimeout(() => { btn.textContent = orig; }, 1400);
    }
  });

  updateCartBadge();
}

function openCartPanel() {
  renderCartPanel();
  document.getElementById('cart-panel').classList.add('is-open');
  document.getElementById('cart-overlay').classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeCartPanel() {
  document.getElementById('cart-panel').classList.remove('is-open');
  document.getElementById('cart-overlay').classList.remove('is-open');
  document.body.style.overflow = '';
}

function renderCartPanel() {
  const cart    = getCart();
  const itemsEl = document.getElementById('cart-items');
  const footerEl= document.getElementById('cart-footer');
  if (!itemsEl || !footerEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty-icon" aria-hidden="true">🛒</span>
        <p>Your cart is empty.</p>
        <a href="catalog.html" class="btn btn-outline btn-sm" style="margin-top:1rem;"
           onclick="closeCartPanel()">Browse products</a>
      </div>`;
    footerEl.innerHTML = '';
    return;
  }

  const products = getProducts();

  itemsEl.innerHTML = cart.map(item => {
    const product   = products.find(p => p.id === item.id);
    const numPrice  = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
    const lineTotal = (numPrice * item.qty).toFixed(2);
    const sym       = item.price.replace(/[\d.,\s]/g, '').trim() || '€';
    const atMax     = product && typeof product.stock === 'number' && item.qty >= product.stock;
    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <span class="cart-item-name">${escapeHtml(item.name)}</span>
          <span class="cart-item-unit-price">${escapeHtml(item.price)} / unit</span>
        </div>
        <div class="cart-item-right">
          <div class="qty-controls">
            <button class="qty-btn" data-qty-id="${item.id}" data-delta="-1"
                    aria-label="Decrease quantity">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-qty-id="${item.id}" data-delta="1"
                    ${atMax ? 'disabled title="Maximum stock reached"' : ''}
                    aria-label="Increase quantity">+</button>
          </div>
          <span class="cart-item-line-price">${sym}${lineTotal}</span>
          <button class="cart-item-remove" data-remove-id="${item.id}"
                  aria-label="Remove ${escapeHtml(item.name)}">&#x2715;</button>
        </div>
      </div>`;
  }).join('');

  itemsEl.querySelectorAll('[data-qty-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = parseInt(btn.dataset.qtyId, 10);
      const item = getCart().find(i => i.id === id);
      if (item) setCartQty(id, item.qty + parseInt(btn.dataset.delta, 10));
    });
  });
  itemsEl.querySelectorAll('[data-remove-id]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.removeId, 10)));
  });

  const sym   = (cart[0]?.price ?? '€').replace(/[\d.,\s]/g, '').trim() || '€';
  const total = sym + getCartTotal().toFixed(2);

  footerEl.innerHTML = `
    <div class="cart-total-row">
      <span class="cart-total-label">Total</span>
      <span class="cart-total-value">${total}</span>
    </div>
    <button class="btn btn-primary btn-lg" id="checkout-btn" style="width:100%;">
      Checkout →
    </button>`;
  footerEl.querySelector('#checkout-btn').addEventListener('click', () => {
    closeCartPanel();
    openCheckoutModal();
  });
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count;
  badge.hidden = count === 0;
}

function animateBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  badge.classList.remove('badge-pop');
  void badge.offsetWidth;
  badge.classList.add('badge-pop');
}

/* ---- CHECKOUT MODAL --------------------------------------- */

function initCheckoutModal() {
  const overlay = document.createElement('div');
  overlay.id = 'checkout-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'checkout-modal-title');
  overlay.innerHTML = `
    <div class="modal" id="checkout-modal">
      <button class="modal-close" id="checkout-modal-close" aria-label="Close">&#x2715;</button>
      <div id="checkout-form-section">
        <h2 class="modal-title" id="checkout-modal-title">Place Order</h2>
        <p class="modal-subtitle">Leave your contact details — we'll confirm your order shortly.</p>
        <form id="checkout-form" novalidate>
          <div class="form-group">
            <label for="co-name">Your Name <span class="form-required" aria-hidden="true">*</span></label>
            <input type="text" id="co-name" name="name"
                   placeholder="e.g. Maria Schmidt" autocomplete="name" required />
            <p class="form-error" id="co-error-name" role="alert"></p>
          </div>
          <div class="form-group">
            <label for="co-phone">Phone Number <span class="form-required" aria-hidden="true">*</span></label>
            <input type="tel" id="co-phone" name="phone"
                   placeholder="e.g. +49 170 1234567" autocomplete="tel" required />
            <p class="form-error" id="co-error-phone" role="alert"></p>
          </div>
          <div class="form-group">
            <label for="co-comment">
              Comment <span style="color:var(--text-muted);font-weight:400;">(optional)</span>
            </label>
            <textarea id="co-comment" name="comment"
                      placeholder="Delivery preferences, questions, etc."></textarea>
          </div>
          <p class="form-error" id="co-error-general" role="alert"></p>
          <button type="submit" class="btn btn-primary btn-lg" id="checkout-submit-btn"
                  style="width:100%;margin-top:0.25rem;">Send Order</button>
        </form>
      </div>
      <div id="checkout-success-section" hidden>
        <div class="modal-success">
          <div class="success-icon">✅</div>
          <h3>Order Received!</h3>
          <p>Thank you! We'll be in touch shortly to confirm your order.</p>
          <button class="btn btn-outline" id="checkout-success-close">Close</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeCheckoutModal(); });
  overlay.querySelector('#checkout-modal-close').addEventListener('click', closeCheckoutModal);
  overlay.querySelector('#checkout-success-close').addEventListener('click', closeCheckoutModal);
  overlay.querySelector('#checkout-form').addEventListener('submit', handleCheckoutSubmit);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeCheckoutModal();
  });
}

function openCheckoutModal() {
  const overlay = document.getElementById('checkout-modal-overlay');
  if (!overlay) return;
  document.getElementById('checkout-form-section').hidden = false;
  document.getElementById('checkout-success-section').hidden = true;
  document.getElementById('co-name').value    = '';
  document.getElementById('co-phone').value   = '';
  document.getElementById('co-comment').value = '';
  clearCheckoutErrors();
  const btn = document.getElementById('checkout-submit-btn');
  btn.disabled    = false;
  btn.textContent = 'Send Order';
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('co-name').focus(), 60);
}

function closeCheckoutModal() {
  const overlay = document.getElementById('checkout-modal-overlay');
  if (overlay) overlay.classList.remove('is-open');
  document.body.style.overflow = '';
}

function clearCheckoutErrors() {
  ['co-error-name', 'co-error-phone', 'co-error-general'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function setCheckoutError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  clearCheckoutErrors();

  const name    = document.getElementById('co-name').value.trim();
  const phone   = document.getElementById('co-phone').value.trim();
  const comment = document.getElementById('co-comment').value.trim();
  const cart    = getCart();

  let valid = true;
  if (name.length < 2)   { setCheckoutError('co-error-name',    'Please enter your name (at least 2 characters).'); valid = false; }
  if (phone.length < 5)  { setCheckoutError('co-error-phone',   'Please enter a valid phone number.'); valid = false; }
  if (cart.length === 0) { setCheckoutError('co-error-general', 'Your cart is empty.'); valid = false; }
  if (!valid) return;

  /* Validate stock availability before sending */
  const products = getProducts();
  for (const item of cart) {
    const p = products.find(x => x.id === item.id);
    if (p && typeof p.stock === 'number' && p.stock < item.qty) {
      setCheckoutError('co-error-general',
        `Sorry, only ${p.stock} unit${p.stock !== 1 ? 's' : ''} of "${p.name}" available.`);
      return;
    }
  }

  const submitBtn = document.getElementById('checkout-submit-btn');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Sending…';

  /* Build Telegram message */
  const sym = (cart[0]?.price ?? '€').replace(/[\d.,\s]/g, '').trim() || '€';

  const itemLines = cart.map(item => {
    const p         = products.find(x => x.id === item.id);
    const numPrice  = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
    const lineTotal = (numPrice * item.qty).toFixed(2);
    const itemSym   = item.price.replace(/[\d.,\s]/g, '').trim() || '€';
    const remaining = (p && typeof p.stock === 'number') ? p.stock - item.qty : null;
    const stockNote = remaining !== null ? ` [${remaining} left after]` : '';
    return `  • ${item.name} × ${item.qty} — ${itemSym}${lineTotal}${stockNote}`;
  }).join('\n');

  const total = sym + getCartTotal().toFixed(2);

  const text = [
    '🌿 New Order!',
    '',
    '🛒 Items:',
    itemLines,
    '',
    `Total: ${total}`,
    '',
    `👤 Name: ${name}`,
    `📞 Phone: ${phone}`,
    `💬 Comment: ${comment || '—'}`,
  ].join('\n');

  try {
    await sendTelegramMessage(text);

    /* Decrement stock for tracked products */
    cart.forEach(item => {
      const p = products.find(x => x.id === item.id);
      if (p && typeof p.stock === 'number') {
        p.stock = Math.max(0, p.stock - item.qty);
      }
    });
    saveProducts(products);

    saveOrder({ name, phone, comment, items: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price })), total });
    clearCart();
    updateCartBadge();
    document.getElementById('checkout-form-section').hidden = true;
    document.getElementById('checkout-success-section').hidden = false;
  } catch (err) {
    console.error('Order send error:', err);
    setCheckoutError('co-error-general', 'Could not send your order. Please try again or contact us directly.');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Send Order';
  }
}

/* ---- TELEGRAM --------------------------------------------- */

async function sendTelegramMessage(text, replyMarkup = null) {
  if (BOT_TOKEN === 'YOUR_BOT_TOKEN') {
    await new Promise(r => setTimeout(r, 700));
    console.log('[DEV MODE] Telegram message:\n' + text);
    return;
  }
  const url  = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = { chat_id: CHAT_ID, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res  = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.description || `HTTP ${res.status}`);
  }
}

/* ---- ORDER STORAGE ---------------------------------------- */

function saveOrder({ name, phone, comment, items, total }) {
  try {
    const orders = JSON.parse(localStorage.getItem('greenroot_orders') || '[]');
    orders.unshift({ ts: new Date().toISOString(), name, phone, comment, items, total });
    if (orders.length > 50) orders.length = 50;
    localStorage.setItem('greenroot_orders', JSON.stringify(orders));
  } catch (e) {
    console.warn('Could not save order:', e);
  }
}

/* ---- CATALOG RENDERER ------------------------------------- */

function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  grid.innerHTML = '';
  getProducts().forEach(product => {
    const outOfStock = typeof product.stock === 'number' && product.stock === 0;
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-card-image"
           style="background:${product.gradient};"
           role="img"
           aria-label="${escapeHtml(product.name)} product illustration"
      >${product.emoji}</div>
      <div class="product-card-body">
        <div class="product-card-top">
          <h2 class="product-card-name">${escapeHtml(product.name)}</h2>
          ${stockBadge(product.stock)}
        </div>
        <p class="product-card-desc">${escapeHtml(product.shortDesc)}</p>
        <div class="product-card-footer">
          <span class="product-price">${escapeHtml(product.price)}</span>
          <div class="card-actions">
            <a href="product.html?id=${product.id}"
               class="btn btn-outline btn-sm"
               aria-label="View details for ${escapeHtml(product.name)}">Details</a>
            <button class="btn btn-primary btn-sm"
                    data-cart-id="${product.id}"
                    ${outOfStock ? 'disabled' : ''}
                    aria-label="${outOfStock ? 'Out of stock' : 'Add ' + escapeHtml(product.name) + ' to cart'}"
            >${outOfStock ? 'Out of stock' : 'Add to Cart'}</button>
          </div>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

/* ---- PRODUCT DETAIL RENDERER ------------------------------ */

function renderProduct() {
  const container = document.getElementById('product-detail');
  if (!container) return;

  const id      = parseInt(new URLSearchParams(window.location.search).get('id'), 10);
  const product = getProducts().find(p => p.id === id);

  if (!product) {
    container.innerHTML = `
      <div class="product-not-found">
        <h2>Product not found</h2>
        <p>The product you're looking for doesn't exist or may have been removed.</p>
        <a href="catalog.html" class="btn btn-outline" style="margin-top:1.25rem;">Back to Catalog</a>
      </div>`;
    return;
  }

  document.title = `${product.name} — GreenRoot`;
  const crumb = document.getElementById('breadcrumb-name');
  if (crumb) crumb.textContent = product.name;

  const outOfStock = typeof product.stock === 'number' && product.stock === 0;

  container.innerHTML = `
    <div class="product-detail">
      <div>
        <div class="product-detail-image"
             style="background:${product.gradient};"
             role="img"
             aria-label="${escapeHtml(product.name)} product illustration"
        >${product.emoji}</div>
      </div>
      <div class="product-detail-info">
        <h1>${escapeHtml(product.name)}</h1>
        <div class="product-detail-meta">
          <p class="product-detail-price">${escapeHtml(product.price)}</p>
          ${stockBadge(product.stock)}
        </div>
        <p class="product-detail-desc">${escapeHtml(product.description)}</p>
        <div class="product-detail-rule"></div>
        <div class="product-detail-usage">
          <h3>How to Use</h3>
          <p>${escapeHtml(product.usage)}</p>
        </div>
        <button class="btn btn-primary btn-lg"
                data-cart-id="${product.id}"
                ${outOfStock ? 'disabled' : ''}
        >${outOfStock ? 'Out of stock' : 'Add to Cart'}</button>
      </div>
    </div>`;
}

/* ---- UTILITIES -------------------------------------------- */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function setActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === page);
  });
}

/* ---- PAGE INIT -------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
  initCart();
  initCheckoutModal();
  if (document.getElementById('catalog-grid'))   renderCatalog();
  if (document.getElementById('product-detail')) renderProduct();
});

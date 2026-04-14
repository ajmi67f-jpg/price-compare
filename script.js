'use strict';

// ══════════════════════════════════════
//  IndexedDB
// ══════════════════════════════════════
const DB_NAME = 'prices_db_v2', DB_VER = 1;
let db;

function initDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('invoices'))
        d.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => { db = e.target.result; res(); };
    req.onerror   = () => rej(req.error);
  });
}

const dbStore  = (m = 'readonly') => db.transaction('invoices', m).objectStore('invoices');
const dbAdd    = inv => new Promise((res, rej) => { const r = dbStore('readwrite').add(inv);   r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbGetAll = ()  => new Promise((res, rej) => { const r = dbStore().getAll();               r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbDel    = id  => new Promise((res, rej) => { const r = dbStore('readwrite').delete(id); r.onsuccess = () => res();         r.onerror = () => rej(r.error); });

// ══════════════════════════════════════
//  المحلات
// ══════════════════════════════════════
const STORES_KEY     = 'saved_stores_v2';
const DEFAULT_STORES = ['لولو هايبر', 'جمعية السالمية', 'كارفور', 'أسواق الكويت'];

function loadStores() {
  try { const s = localStorage.getItem(STORES_KEY); return s ? JSON.parse(s) : [...DEFAULT_STORES]; }
  catch { return [...DEFAULT_STORES]; }
}
function saveStores(list) { localStorage.setItem(STORES_KEY, JSON.stringify(list)); }

// ══════════════════════════════════════
//  الحالة
// ══════════════════════════════════════
let allInvoices   = [];
let currentItems  = [];
let savedStores   = [];
let selectedStore = '';
let invoiceImgData = null;
let viewInvoiceId  = null;
let compareCat     = '';

// ══════════════════════════════════════
//  بيانات تجريبية
// ══════════════════════════════════════
const SEED = [
  { store: 'لولو هايبر', date: '2025-01-10', imageData: null, items: [
    { category: 'أرز',   brand: 'بسمتي ممتاز',  packSize: 5,  unit: 'كيلو', packPrice: 2.500, unitPrice: 0.500, qty: 1 },
    { category: 'أرز',   brand: 'الوليمة',       packSize: 5,  unit: 'كيلو', packPrice: 2.200, unitPrice: 0.440, qty: 1 },
    { category: 'حليب',  brand: 'أرلا',          packSize: 1,  unit: 'لتر',  packPrice: 0.350, unitPrice: 0.350, qty: 4 },
    { category: 'زيت',   brand: 'عافية',         packSize: 1.5,unit: 'لتر',  packPrice: 1.200, unitPrice: 0.800, qty: 2 },
  ]},
  { store: 'جمعية السالمية', date: '2025-01-12', imageData: null, items: [
    { category: 'أرز',   brand: 'بسمتي ممتاز',  packSize: 5,  unit: 'كيلو', packPrice: 2.650, unitPrice: 0.530, qty: 1 },
    { category: 'أرز',   brand: 'أبو بنت',       packSize: 5,  unit: 'كيلو', packPrice: 2.100, unitPrice: 0.420, qty: 1 },
    { category: 'حليب',  brand: 'نستله',         packSize: 1,  unit: 'لتر',  packPrice: 0.320, unitPrice: 0.320, qty: 6 },
    { category: 'بيض',   brand: 'بيض بلدي',      packSize: 30, unit: 'حبة',  packPrice: 1.800, unitPrice: 0.060, qty: 1 },
  ]},
  { store: 'كارفور', date: '2025-01-15', imageData: null, items: [
    { category: 'أرز',   brand: 'الوليمة',       packSize: 10, unit: 'كيلو', packPrice: 4.200, unitPrice: 0.420, qty: 1 },
    { category: 'أرز',   brand: 'أبو بنت',       packSize: 5,  unit: 'كيلو', packPrice: 1.950, unitPrice: 0.390, qty: 2 },
    { category: 'زيت',   brand: 'عافية',         packSize: 1.5,unit: 'لتر',  packPrice: 1.100, unitPrice: 0.733, qty: 2 },
    { category: 'بيض',   brand: 'بيض بلدي',      packSize: 30, unit: 'حبة',  packPrice: 1.650, unitPrice: 0.055, qty: 1 },
  ]},
  { store: 'أسواق الكويت', date: '2025-01-18', imageData: null, items: [
    { category: 'أرز',   brand: 'بسمتي ممتاز',  packSize: 5,  unit: 'كيلو', packPrice: 2.450, unitPrice: 0.490, qty: 1 },
    { category: 'حليب',  brand: 'أرلا',          packSize: 1,  unit: 'لتر',  packPrice: 0.330, unitPrice: 0.330, qty: 4 },
    { category: 'زيت',   brand: 'بيتي كروكر',   packSize: 1.5,unit: 'لتر',  packPrice: 1.050, unitPrice: 0.700, qty: 2 },
    { category: 'بيض',   brand: 'بيض مزرعة',     packSize: 15, unit: 'حبة',  packPrice: 0.950, unitPrice: 0.063, qty: 2 },
  ]},
];

// ══════════════════════════════════════
//  تهيئة
// ══════════════════════════════════════
async function init() {
  await initDB();
  const existing = await dbGetAll();
  if (!existing.length) for (const inv of SEED) await dbAdd(inv);
  savedStores = loadStores();
  await reload();
  setupEvents();
  document.getElementById('f-date').value = today();
}

async function reload() {
  allInvoices = await dbGetAll();
  allInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));
  renderHome();
}

// ══════════════════════════════════════
//  أدوات
// ══════════════════════════════════════
const today = () => new Date().toISOString().split('T')[0];
function fmt(d) { return new Date(d).toLocaleDateString('ar-KW', { day: 'numeric', month: 'long', year: 'numeric' }); }
function h(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function show(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('hidden', s.id !== id);
    s.classList.toggle('active', s.id === id);
  });
}

// ══════════════════════════════════════
//  بناء خريطة الفئات
// ══════════════════════════════════════
function buildCategoryMap() {
  const map = {};
  for (const inv of allInvoices) {
    for (const item of (inv.items || [])) {
      const cat = (item.category || '').trim();
      if (!cat) continue;
      if (!map[cat]) map[cat] = [];
      map[cat].push({
        brand:     (item.brand || '').trim(),
        packSize:  item.packSize,
        unit:      item.unit,
        packPrice: item.packPrice,
        unitPrice: item.unitPrice,
        qty:       item.qty,
        store:     inv.store,
        date:      inv.date,
        invId:     inv.id,
      });
    }
  }
  return map;
}

// ══════════════════════════════════════
//  الرئيسية
// ══════════════════════════════════════
function renderHome() {
  const map   = buildCategoryMap();
  const cats  = Object.keys(map).sort();
  const list  = document.getElementById('categories-list');
  const empty = document.getElementById('home-empty');
  const hint  = document.getElementById('home-hint');

  if (!cats.length) {
    list.innerHTML = ''; empty.classList.remove('hidden'); hint.classList.add('hidden'); return;
  }
  empty.classList.add('hidden'); hint.classList.remove('hidden');

  list.innerHTML = cats.map((cat, i) => {
    const entries  = map[cat];
    const minPrice = Math.min(...entries.map(e => e.unitPrice));
    const unit     = entries[0].unit;

    // تجميع البراندات مع أرخص سعر لكل واحد
    const brandMap = {};
    for (const e of entries) {
      if (!brandMap[e.brand] || e.unitPrice < brandMap[e.brand])
        brandMap[e.brand] = e.unitPrice;
    }
    const brands = Object.entries(brandMap).sort((a, b) => a[1] - b[1]);
    const cheapestBrand = brands[0][0];

    const chips = brands.map(([brand, price]) =>
      `<div class="brand-chip${brand === cheapestBrand ? ' cheapest' : ''}">
        ${h(brand)} · ${price.toFixed(3)}
       </div>`
    ).join('');

    return `
      <div class="category-card" onclick="openCompare('${h(cat)}')" style="animation-delay:${i * 0.05}s">
        <div class="cat-header">
          <div class="cat-name">${h(cat)}</div>
          <div class="cat-count">${brands.length} براند</div>
          <div class="cat-arrow">‹</div>
        </div>
        <div class="cat-brands">${chips}</div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════
//  مقارنة فئة
// ══════════════════════════════════════
function openCompare(cat) {
  compareCat = cat;
  const map     = buildCategoryMap();
  const entries = map[cat] || [];

  // تجميع: لكل (براند + محل) أخذ أحدث سجل
  const grouped = {};
  for (const e of entries) {
    const key = `${e.brand}||${e.store}`;
    if (!grouped[key] || new Date(e.date) > new Date(grouped[key].date))
      grouped[key] = e;
  }

  const rows = Object.values(grouped).sort((a, b) => a.unitPrice - b.unitPrice);
  const minP = rows[0]?.unitPrice;
  const maxP = rows[rows.length - 1]?.unitPrice;
  const diff = rows.length > 1 ? (maxP - minP).toFixed(3) : '—';
  const pct  = rows.length > 1 && minP > 0 ? Math.round(((maxP - minP) / minP) * 100) : 0;

  document.getElementById('compare-title').textContent = cat;
  document.getElementById('compare-summary').innerHTML = `
    <div class="summary-bar">
      <div class="sc-l">الأرخص: <span>${minP?.toFixed(3)} د.ك/${rows[0]?.unit}</span></div>
      <div class="sc-r">الفرق: <span>${diff} د.ك (${pct}%)</span></div>
    </div>`;

  document.getElementById('compare-list').innerHTML = rows.map((e, i) => {
    const isBest  = e.unitPrice === minP;
    const isWorst = e.unitPrice === maxP && rows.length > 1;
    const topCls  = isBest ? 'best-bg' : isWorst ? 'worst-bg' : '';
    return `
      <div class="compare-card ${isBest ? 'best' : isWorst ? 'worst' : ''}"
           style="animation-delay:${i * 0.06}s" onclick="openInvoiceView(${e.invId})">
        <div class="cc-top ${topCls}">
          <div class="rank">${i + 1}</div>
          <div class="cc-info">
            <div class="cc-brand">${h(e.brand)}</div>
            <div class="cc-store">${h(e.store)}</div>
            <div class="cc-date">${fmt(e.date)}</div>
          </div>
          <div class="cc-price-col">
            <div class="cc-unit-price">${e.unitPrice.toFixed(3)}</div>
            <div class="cc-unit-label">د.ك / ${e.unit}</div>
          </div>
        </div>
        <div class="cc-bottom">
          <span>حجم العبوة</span>
          <span>${e.packSize} ${e.unit} بـ ${e.packPrice.toFixed(3)} د.ك</span>
        </div>
      </div>`;
  }).join('');

  show('screen-compare');
}

// ══════════════════════════════════════
//  تفاصيل فاتورة
// ══════════════════════════════════════
function openInvoiceView(id) {
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;
  viewInvoiceId = id;

  document.getElementById('invoice-screen-title').textContent = inv.store;

  const img = document.getElementById('invoice-img-view');
  if (inv.imageData) { img.src = inv.imageData; img.classList.remove('hidden'); }
  else img.classList.add('hidden');

  const total = (inv.items || []).reduce((s, it) => s + it.packPrice * it.qty, 0);

  document.getElementById('invoice-detail-body').innerHTML = `
    <div class="invoice-meta-box">📅 ${fmt(inv.date)}</div>
    ${(inv.items || []).map(it => `
      <div class="inv-item-row">
        <div class="inv-item-info">
          <div class="inv-item-cat">${h(it.category || '')}</div>
          <div class="inv-item-brand">${h(it.brand || it.name || '')}</div>
          <div class="inv-item-size">${it.packSize} ${it.unit} × ${it.qty}</div>
        </div>
        <div class="inv-item-price">${it.packPrice.toFixed(3)}</div>
      </div>`).join('')}
    <div class="total-row">
      <span class="total-label">الإجمالي</span>
      <span class="total-value">${total.toFixed(3)} د.ك</span>
    </div>`;

  show('screen-invoice');
}

async function deleteCurrentInvoice() {
  if (!viewInvoiceId) return;
  if (!confirm('حذف هذه الفاتورة؟')) return;
  await dbDel(viewInvoiceId);
  viewInvoiceId = null;
  await reload();
  toast('🗑 تم حذف الفاتورة');
  show('screen-home');
}

// ══════════════════════════════════════
//  إضافة فاتورة
// ══════════════════════════════════════
function openAdd() {
  currentItems = []; selectedStore = ''; invoiceImgData = null;
  document.getElementById('f-date').value       = today();
  document.getElementById('f-category').value   = '';
  document.getElementById('f-brand').value      = '';
  document.getElementById('f-pack-size').value  = '1';
  document.getElementById('f-pack-price').value = '';
  document.getElementById('f-qty').value        = '1';
  document.getElementById('f-unit').value       = 'كيلو';
  document.getElementById('new-store-row').classList.add('hidden');
  document.getElementById('unit-price-box').classList.add('hidden');
  document.getElementById('img-preview-wrap').classList.add('hidden');
  document.getElementById('img-options-row').classList.remove('hidden');
  document.getElementById('img-camera').value  = '';
  document.getElementById('img-gallery').value = '';
  renderStoreBtns();
  renderCurrentItems();
  show('screen-add');
}

// ══════════════════════════════════════
//  صورة
// ══════════════════════════════════════
function onImageUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    invoiceImgData = ev.target.result;
    document.getElementById('img-preview').src = invoiceImgData;
    document.getElementById('img-preview-wrap').classList.remove('hidden');
    document.getElementById('img-options-row').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function removeImg() {
  invoiceImgData = null;
  document.getElementById('img-preview-wrap').classList.add('hidden');
  document.getElementById('img-options-row').classList.remove('hidden');
  document.getElementById('img-camera').value  = '';
  document.getElementById('img-gallery').value = '';
}

// ══════════════════════════════════════
//  أزرار المحلات
// ══════════════════════════════════════
function renderStoreBtns() {
  document.getElementById('store-btns').innerHTML =
    savedStores.map(s =>
      `<button class="store-btn${selectedStore === s ? ' selected' : ''}"
               onclick="selectStore('${s.replace(/'/g, "\\'")}'">${h(s)}</button>`
    ).join('') +
    `<button class="btn-add-store" onclick="showNewStoreInput()">+ محل جديد</button>`;
}

function selectStore(name) { selectedStore = name; renderStoreBtns(); }

function showNewStoreInput() {
  document.getElementById('new-store-row').classList.remove('hidden');
  document.getElementById('f-new-store').value = '';
  document.getElementById('f-new-store').focus();
}

function confirmNewStore() {
  const name = document.getElementById('f-new-store').value.trim();
  if (!name) { toast('⚠️ أدخل اسم المحل'); return; }
  if (savedStores.includes(name)) { toast('المحل موجود مسبقاً'); return; }
  savedStores.push(name); saveStores(savedStores);
  selectedStore = name;
  document.getElementById('new-store-row').classList.add('hidden');
  renderStoreBtns(); toast('✅ تم إضافة المحل');
}

// ══════════════════════════════════════
//  إدارة المحلات
// ══════════════════════════════════════
function openStoresMgr() {
  document.getElementById('f-new-store-mgr').value = '';
  renderStoresMgr(); show('screen-stores');
}

function renderStoresMgr() {
  const list = document.getElementById('stores-mgr-list');
  if (!savedStores.length) {
    list.innerHTML = `<div class="empty" style="padding:28px 0">
      <div class="empty-icon">🏪</div><div class="empty-text">لا توجد محلات</div></div>`;
    return;
  }
  list.innerHTML = savedStores.map((s, i) => `
    <div class="store-mgr-row" style="animation-delay:${i * 0.05}s">
      <button class="store-mgr-del" onclick="deleteMgrStore('${s.replace(/'/g, "\\'")}')">✕</button>
      <input class="store-mgr-name" value="${h(s)}"
        onblur="renameMgrStore(this,'${s.replace(/'/g, "\\'")}')"
        onkeydown="if(event.key==='Enter')this.blur()">
    </div>`).join('');
}

function deleteMgrStore(name) {
  if (!confirm(`حذف "${name}"؟`)) return;
  savedStores = savedStores.filter(s => s !== name);
  saveStores(savedStores); renderStoresMgr(); toast(`🗑 تم حذف ${name}`);
}

function renameMgrStore(input, oldName) {
  const newName = input.value.trim();
  if (!newName || newName === oldName) { input.value = oldName; return; }
  if (savedStores.includes(newName)) { toast('⚠️ الاسم موجود مسبقاً'); input.value = oldName; return; }
  const idx = savedStores.indexOf(oldName);
  if (idx !== -1) savedStores[idx] = newName;
  if (selectedStore === oldName) selectedStore = newName;
  saveStores(savedStores); renderStoresMgr(); toast('✅ تم تعديل الاسم');
}

function addStoreMgr() {
  const name = document.getElementById('f-new-store-mgr').value.trim();
  if (!name) { toast('⚠️ أدخل اسم المحل'); return; }
  if (savedStores.includes(name)) { toast('⚠️ المحل موجود مسبقاً'); return; }
  savedStores.push(name); saveStores(savedStores);
  document.getElementById('f-new-store-mgr').value = '';
  renderStoresMgr(); toast('✅ تم إضافة المحل');
}

// ══════════════════════════════════════
//  الأصناف
// ══════════════════════════════════════
function renderCurrentItems() {
  const el = document.getElementById('items-added');
  if (!currentItems.length) { el.innerHTML = ''; return; }
  el.innerHTML = currentItems.map((it, i) => `
    <div class="item-pill">
      <div class="item-pill-info">
        <div class="item-pill-cat">${h(it.category)}</div>
        <div class="item-pill-brand">${h(it.brand)}</div>
        <div class="item-pill-meta">${it.packSize} ${it.unit} · ${it.unitPrice.toFixed(3)} د.ك/${it.unit}</div>
      </div>
      <div class="item-pill-price">${it.packPrice.toFixed(3)} د.ك</div>
      <button class="item-pill-del" onclick="removeItem(${i})">×</button>
    </div>`).join('');
}

function removeItem(i) { currentItems.splice(i, 1); renderCurrentItems(); }

function calcUnitPrice() {
  const pp  = parseFloat(document.getElementById('f-pack-price').value);
  const ps  = parseFloat(document.getElementById('f-pack-size').value) || 1;
  const unit = document.getElementById('f-unit').value;
  const box = document.getElementById('unit-price-box');
  if (!isNaN(pp) && pp > 0) {
    document.getElementById('unit-price-val').textContent = (pp / ps).toFixed(3) + ' د.ك / ' + unit;
    box.classList.remove('hidden');
  } else { box.classList.add('hidden'); }
}

function addItem() {
  const category = document.getElementById('f-category').value.trim();
  const brand    = document.getElementById('f-brand').value.trim();
  const packSize = parseFloat(document.getElementById('f-pack-size').value) || 1;
  const unit     = document.getElementById('f-unit').value;
  const packPrice = parseFloat(document.getElementById('f-pack-price').value);
  const qty      = parseInt(document.getElementById('f-qty').value) || 1;

  if (!category)               { toast('⚠️ أدخل الفئة');        return; }
  if (!brand)                  { toast('⚠️ أدخل البراند');       return; }
  if (isNaN(packPrice) || packPrice <= 0) { toast('⚠️ أدخل سعر العبوة'); return; }

  const unitPrice = packPrice / packSize;
  currentItems.push({ category, brand, packSize, unit, packPrice, unitPrice, qty });
  renderCurrentItems();

  document.getElementById('f-category').value   = '';
  document.getElementById('f-brand').value      = '';
  document.getElementById('f-pack-size').value  = '1';
  document.getElementById('f-pack-price').value = '';
  document.getElementById('f-qty').value        = '1';
  document.getElementById('unit-price-box').classList.add('hidden');
  document.getElementById('f-category').focus();
  hideSugg('sugg-category'); hideSugg('sugg-brand');
}

async function saveInvoice() {
  const date = document.getElementById('f-date').value;
  if (!selectedStore)       { toast('⚠️ اختر المحل أولاً');            return; }
  if (!date)                { toast('⚠️ أدخل التاريخ');               return; }
  if (!currentItems.length) { toast('⚠️ أضف صنفاً واحداً على الأقل'); return; }

  await dbAdd({ store: selectedStore, date, imageData: invoiceImgData, items: [...currentItems] });
  await reload();
  toast('✅ تم حفظ الفاتورة');
  show('screen-home');
}

// ══════════════════════════════════════
//  تصدير واستيراد
// ══════════════════════════════════════
async function exportData() {
  const invoices = await dbGetAll();
  const blob = new Blob([JSON.stringify({ version: 2, stores: savedStores, invoices }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `prices-${today()}.json` });
  a.click(); URL.revokeObjectURL(a.href);
  toast('📤 تم تصدير البيانات');
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.invoices || !Array.isArray(data.invoices)) throw new Error();
      if (!confirm(`استيراد ${data.invoices.length} فاتورة؟`)) return;
      for (const inv of data.invoices) { const { id, ...d } = inv; await dbAdd(d); }
      if (data.stores) { data.stores.forEach(s => { if (!savedStores.includes(s)) savedStores.push(s); }); saveStores(savedStores); }
      await reload(); toast(`✅ تم استيراد ${data.invoices.length} فاتورة`);
    } catch { toast('⚠️ خطأ في قراءة الملف'); }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ══════════════════════════════════════
//  اقتراحات
// ══════════════════════════════════════
function getKnown(field) {
  const set = new Set();
  for (const inv of allInvoices)
    for (const item of (inv.items || []))
      if (item[field]) set.add(item[field].trim());
  return [...set];
}

function showSugg(inputId, suggId, field) {
  const val = document.getElementById(inputId).value.trim();
  const box = document.getElementById(suggId);
  if (!val) { box.classList.add('hidden'); return; }
  const matches = getKnown(field).filter(n => n.includes(val)).slice(0, 6);
  if (!matches.length) { box.classList.add('hidden'); return; }
  box.innerHTML = matches.map(m =>
    `<div class="sugg-item" onclick="pickSugg('${inputId}','${suggId}','${m.replace(/'/g, "\\'")}')">${h(m)}</div>`
  ).join('');
  box.classList.remove('hidden');
}

function hideSugg(id) { document.getElementById(id).classList.add('hidden'); }

function pickSugg(inputId, suggId, val) {
  document.getElementById(inputId).value = val;
  hideSugg(suggId);
  if (inputId === 'f-category') document.getElementById('f-brand').focus();
  else document.getElementById('f-pack-size').focus();
}

// ══════════════════════════════════════
//  Toast
// ══════════════════════════════════════
let toastTmr;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTmr); toastTmr = setTimeout(() => el.classList.remove('show'), 2300);
}

// ══════════════════════════════════════
//  الأحداث
// ══════════════════════════════════════
function setupEvents() {
  document.getElementById('btn-go-add').addEventListener('click',         openAdd);
  document.getElementById('btn-empty-add').addEventListener('click',      openAdd);
  document.getElementById('btn-go-stores').addEventListener('click',      openStoresMgr);
  document.getElementById('btn-back-stores').addEventListener('click',    () => show('screen-home'));
  document.getElementById('btn-back-compare').addEventListener('click',   () => show('screen-home'));
  document.getElementById('btn-back-add').addEventListener('click',       () => show('screen-home'));
  document.getElementById('btn-back-invoice').addEventListener('click',   () => show('screen-compare'));
  document.getElementById('btn-delete-invoice').addEventListener('click', deleteCurrentInvoice);

  document.getElementById('btn-camera').addEventListener('click',  () => document.getElementById('img-camera').click());
  document.getElementById('btn-gallery').addEventListener('click', () => document.getElementById('img-gallery').click());
  document.getElementById('img-camera').addEventListener('change',  onImageUpload);
  document.getElementById('img-gallery').addEventListener('change', onImageUpload);
  document.getElementById('btn-remove-img').addEventListener('click', removeImg);

  document.getElementById('btn-confirm-store').addEventListener('click',  confirmNewStore);
  document.getElementById('f-new-store').addEventListener('keydown', e => { if (e.key === 'Enter') confirmNewStore(); });

  document.getElementById('btn-add-store-mgr').addEventListener('click',  addStoreMgr);
  document.getElementById('f-new-store-mgr').addEventListener('keydown', e => { if (e.key === 'Enter') addStoreMgr(); });

  document.getElementById('f-pack-price').addEventListener('input', calcUnitPrice);
  document.getElementById('f-pack-size').addEventListener('input',  calcUnitPrice);
  document.getElementById('f-unit').addEventListener('change',      calcUnitPrice);

  document.getElementById('btn-add-item').addEventListener('click', addItem);
  document.getElementById('f-pack-price').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });

  document.getElementById('btn-save').addEventListener('click', saveInvoice);

  document.getElementById('btn-export').addEventListener('click',    exportData);
  document.getElementById('btn-import-trigger').addEventListener('click', () => document.getElementById('btn-import').click());
  document.getElementById('btn-import').addEventListener('change',   importData);

  // اقتراحات
  document.getElementById('f-category').addEventListener('input', () => showSugg('f-category', 'sugg-category', 'category'));
  document.getElementById('f-category').addEventListener('blur',  () => setTimeout(() => hideSugg('sugg-category'), 200));
  document.getElementById('f-brand').addEventListener('input',    () => showSugg('f-brand', 'sugg-brand', 'brand'));
  document.getElementById('f-brand').addEventListener('blur',     () => setTimeout(() => hideSugg('sugg-brand'), 200));
}

document.addEventListener('DOMContentLoaded', init);

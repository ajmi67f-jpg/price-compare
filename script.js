'use strict';

// ══════════════════════════════════════
//  IndexedDB
// ══════════════════════════════════════
const DB_NAME = 'prices_db', DB_VER = 1;
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

const dbStore = (mode = 'readonly') =>
  db.transaction('invoices', mode).objectStore('invoices');

const dbAdd    = inv => new Promise((res, rej) => { const r = dbStore('readwrite').add(inv);   r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbGetAll = ()  => new Promise((res, rej) => { const r = dbStore().getAll();               r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbDel    = id  => new Promise((res, rej) => { const r = dbStore('readwrite').delete(id); r.onsuccess = () => res();         r.onerror = () => rej(r.error); });
const dbClear  = ()  => new Promise((res, rej) => { const r = dbStore('readwrite').clear();    r.onsuccess = () => res();         r.onerror = () => rej(r.error); });

// ══════════════════════════════════════
//  المحلات - localStorage
// ══════════════════════════════════════
const STORES_KEY = 'saved_stores';
const DEFAULT_STORES = ['لولو هايبر', 'جمعية السالمية', 'كارفور', 'أسواق الكويت'];

function loadStores() {
  try { const s = localStorage.getItem(STORES_KEY); return s ? JSON.parse(s) : [...DEFAULT_STORES]; }
  catch { return [...DEFAULT_STORES]; }
}
function saveStores(list) { localStorage.setItem(STORES_KEY, JSON.stringify(list)); }

// ══════════════════════════════════════
//  الحالة
// ══════════════════════════════════════
let allInvoices    = [];
let currentItems   = [];
let savedStores    = [];
let selectedStore  = '';
let selectedUnit   = 'حبة';
let invoiceImgData = null;
let viewInvoiceId  = null;

// ══════════════════════════════════════
//  بيانات تجريبية
// ══════════════════════════════════════
const SEED = [
  { store: 'لولو هايبر',      date: '2025-01-10', imageData: null, items: [
    { name: 'أرز بسمتي', unitPrice: 0.925, qty: 2, unit: 'كيلو' },
    { name: 'حليب طازج',  unitPrice: 0.150, qty: 6, unit: 'علبة' },
    { name: 'بيض',        unitPrice: 0.040, qty: 30, unit: 'حبة'  },
  ]},
  { store: 'جمعية السالمية', date: '2025-01-12', imageData: null, items: [
    { name: 'أرز بسمتي', unitPrice: 0.980, qty: 2, unit: 'كيلو' },
    { name: 'حليب طازج',  unitPrice: 0.130, qty: 6, unit: 'علبة' },
    { name: 'زيت دوار',   unitPrice: 0.850, qty: 2, unit: 'لتر'  },
  ]},
  { store: 'كارفور',          date: '2025-01-15', imageData: null, items: [
    { name: 'أرز بسمتي', unitPrice: 0.870, qty: 2, unit: 'كيلو' },
    { name: 'بيض',        unitPrice: 0.035, qty: 30, unit: 'حبة' },
    { name: 'زيت دوار',   unitPrice: 0.790, qty: 2, unit: 'لتر'  },
  ]},
  { store: 'أسواق الكويت',   date: '2025-01-18', imageData: null, items: [
    { name: 'حليب طازج',  unitPrice: 0.140, qty: 6, unit: 'علبة' },
    { name: 'أرز بسمتي', unitPrice: 0.910, qty: 2, unit: 'كيلو' },
    { name: 'زيت دوار',   unitPrice: 0.820, qty: 2, unit: 'لتر'  },
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

function fmt(d) {
  return new Date(d).toLocaleDateString('ar-KW', { day: 'numeric', month: 'long', year: 'numeric' });
}

function h(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════
//  التنقل
// ══════════════════════════════════════
function show(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('hidden', s.id !== id);
    s.classList.toggle('active', s.id === id);
  });
}

// ══════════════════════════════════════
//  الرئيسية
// ══════════════════════════════════════
function renderHome() {
  const map = {};
  for (const inv of allInvoices)
    for (const item of (inv.items || [])) {
      const k = item.name.trim();
      if (!map[k]) map[k] = [];
      map[k].push({ store: inv.store, unitPrice: item.unitPrice, unit: item.unit, date: inv.date, invId: inv.id });
    }

  const names = Object.keys(map).sort();
  const list  = document.getElementById('products-list');
  const empty = document.getElementById('home-empty');
  const hint  = document.getElementById('home-hint');

  if (!names.length) {
    list.innerHTML = ''; empty.classList.remove('hidden'); hint.classList.add('hidden'); return;
  }
  empty.classList.add('hidden'); hint.classList.remove('hidden');

  list.innerHTML = names.map((name, i) => {
    const entries = map[name];
    const minP    = Math.min(...entries.map(e => e.unitPrice));
    const unit    = entries[0].unit || 'وحدة';
    return `
      <div class="product-row" onclick="openCompare('${h(name)}')" style="animation-delay:${i * 0.05}s">
        <div class="pr-name">${h(name)}</div>
        <div class="pr-meta">
          <div style="color:var(--green);font-weight:700">${minP.toFixed(3)} د.ك</div>
          <div style="font-size:10px;color:var(--text3)">${entries.length} محل · /${unit}</div>
        </div>
        <div class="pr-arrow">‹</div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════
//  مقارنة
// ══════════════════════════════════════
function openCompare(name) {
  const entries = [];
  for (const inv of allInvoices)
    for (const item of (inv.items || []))
      if (item.name.trim() === name)
        entries.push({ store: inv.store, unitPrice: item.unitPrice, unit: item.unit, date: inv.date, invId: inv.id });

  entries.sort((a, b) => a.unitPrice - b.unitPrice);

  const minP = entries[0].unitPrice;
  const maxP = entries[entries.length - 1].unitPrice;
  const diff = (maxP - minP).toFixed(3);
  const pct  = minP > 0 ? Math.round(((maxP - minP) / minP) * 100) : 0;

  document.getElementById('compare-title').textContent = name;
  document.getElementById('compare-summary').innerHTML = `
    <div class="summary-bar">
      <div class="sc-l">الأرخص: <span>${minP.toFixed(3)} د.ك</span></div>
      <div class="sc-r">الفرق: <span>${diff} د.ك (${pct}%)</span></div>
    </div>`;

  document.getElementById('compare-list').innerHTML = entries.map((e, i) => {
    const isBest  = e.unitPrice === minP;
    const isWorst = e.unitPrice === maxP && entries.length > 1;
    return `
      <div class="compare-card ${isBest ? 'best' : isWorst ? 'worst' : ''}" style="animation-delay:${i * 0.06}s"
           onclick="openInvoiceView(${e.invId})">
        <div class="rank">${i + 1}</div>
        <div class="ci">
          <div class="ci-store">${h(e.store)}</div>
          <div class="ci-date">${fmt(e.date)}</div>
        </div>
        <div class="cp">
          <div class="cp-price">${e.unitPrice.toFixed(3)}</div>
          <div class="cp-unit">د.ك / ${e.unit || 'وحدة'}</div>
        </div>
      </div>`;
  }).join('');

  show('screen-compare');
}

// ══════════════════════════════════════
//  عرض تفاصيل فاتورة
// ══════════════════════════════════════
function openInvoiceView(id) {
  const inv = allInvoices.find(i => i.id === id);
  if (!inv) return;
  viewInvoiceId = id;

  document.getElementById('invoice-screen-title').textContent = inv.store;

  const img = document.getElementById('invoice-img-view');
  if (inv.imageData) { img.src = inv.imageData; img.classList.remove('hidden'); }
  else img.classList.add('hidden');

  const total = (inv.items || []).reduce((s, it) => s + it.unitPrice * it.qty, 0);

  document.getElementById('invoice-detail-body').innerHTML = `
    <div class="invoice-meta-box">📅 ${fmt(inv.date)}</div>
    ${(inv.items || []).map(it => `
      <div class="inv-item-row">
        <div class="inv-item-name">${h(it.name)}</div>
        <div class="inv-item-meta">${it.qty} ${it.unit}</div>
        <div class="inv-item-price">${it.unitPrice.toFixed(3)}</div>
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
  currentItems  = []; selectedStore = ''; selectedUnit = 'حبة'; invoiceImgData = null;
  document.getElementById('f-date').value       = today();
  document.getElementById('f-name').value       = '';
  document.getElementById('f-pack-price').value = '';
  document.getElementById('f-pack-size').value  = '1';
  document.getElementById('f-qty').value        = '1';
  document.getElementById('new-store-row').classList.add('hidden');
  document.getElementById('unit-price-box').classList.add('hidden');
  document.getElementById('img-preview').classList.add('hidden');
  document.getElementById('btn-remove-img').classList.add('hidden');
  document.getElementById('upload-placeholder').style.display = 'flex';
  document.getElementById('img-upload').value = '';
  document.getElementById('pack-size-label').textContent = 'عدد الحبات';
  document.querySelectorAll('.unit-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.unit === 'حبة'));
  renderStoreBtns();
  renderCurrentItems();
  show('screen-add');
}

// ══════════════════════════════════════
//  صورة الفاتورة
// ══════════════════════════════════════
function onImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    invoiceImgData = ev.target.result;
    const prev = document.getElementById('img-preview');
    prev.src = invoiceImgData;
    prev.classList.remove('hidden');
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('btn-remove-img').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removeImg() {
  invoiceImgData = null;
  document.getElementById('img-preview').classList.add('hidden');
  document.getElementById('btn-remove-img').classList.add('hidden');
  document.getElementById('upload-placeholder').style.display = 'flex';
  document.getElementById('img-upload').value = '';
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
  const row = document.getElementById('new-store-row');
  row.classList.remove('hidden');
  document.getElementById('f-new-store').value = '';
  document.getElementById('f-new-store').focus();
}

function confirmNewStore() {
  const name = document.getElementById('f-new-store').value.trim();
  if (!name) { toast('⚠️ أدخل اسم المحل'); return; }
  if (savedStores.includes(name)) { toast('المحل موجود مسبقاً'); return; }
  savedStores.push(name);
  saveStores(savedStores);
  selectedStore = name;
  document.getElementById('new-store-row').classList.add('hidden');
  renderStoreBtns();
  toast('✅ تم إضافة المحل');
}

// ══════════════════════════════════════
//  إدارة المحلات
// ══════════════════════════════════════
function openStoresMgr() {
  document.getElementById('f-new-store-mgr').value = '';
  renderStoresMgr();
  show('screen-stores');
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
  saveStores(savedStores);
  renderStoresMgr();
  toast(`🗑 تم حذف ${name}`);
}

function renameMgrStore(input, oldName) {
  const newName = input.value.trim();
  if (!newName || newName === oldName) { input.value = oldName; return; }
  if (savedStores.includes(newName)) { toast('⚠️ الاسم موجود مسبقاً'); input.value = oldName; return; }
  const idx = savedStores.indexOf(oldName);
  if (idx !== -1) savedStores[idx] = newName;
  if (selectedStore === oldName) selectedStore = newName;
  saveStores(savedStores);
  renderStoresMgr();
  toast('✅ تم تعديل الاسم');
}

function addStoreMgr() {
  const name = document.getElementById('f-new-store-mgr').value.trim();
  if (!name) { toast('⚠️ أدخل اسم المحل'); return; }
  if (savedStores.includes(name)) { toast('⚠️ المحل موجود مسبقاً'); return; }
  savedStores.push(name);
  saveStores(savedStores);
  document.getElementById('f-new-store-mgr').value = '';
  renderStoresMgr();
  toast('✅ تم إضافة المحل');
}

// ══════════════════════════════════════
//  الأصناف
// ══════════════════════════════════════
function renderCurrentItems() {
  const el = document.getElementById('items-added');
  if (!currentItems.length) { el.innerHTML = ''; return; }
  el.innerHTML = currentItems.map((it, i) => `
    <div class="item-pill">
      <div class="item-pill-name">${h(it.name)}</div>
      <div class="item-pill-price">${it.unitPrice.toFixed(3)} د.ك/${it.unit} × ${it.qty}</div>
      <button class="item-pill-del" onclick="removeItem(${i})">×</button>
    </div>`).join('');
}

function removeItem(i) { currentItems.splice(i, 1); renderCurrentItems(); }

function calcUnitPrice() {
  const pp  = parseFloat(document.getElementById('f-pack-price').value);
  const ps  = parseFloat(document.getElementById('f-pack-size').value) || 1;
  const box = document.getElementById('unit-price-box');
  if (!isNaN(pp) && pp > 0) {
    document.getElementById('unit-price-val').textContent = (pp / ps).toFixed(3) + ' د.ك / ' + selectedUnit;
    box.classList.remove('hidden');
  } else { box.classList.add('hidden'); }
}

function addItem() {
  const name = document.getElementById('f-name').value.trim();
  const pp   = parseFloat(document.getElementById('f-pack-price').value);
  const ps   = parseFloat(document.getElementById('f-pack-size').value) || 1;
  const qty  = parseInt(document.getElementById('f-qty').value) || 1;

  if (!name)               { toast('⚠️ أدخل اسم الصنف');   return; }
  if (isNaN(pp) || pp <= 0) { toast('⚠️ أدخل سعر العبوة'); return; }

  currentItems.push({ name, unitPrice: pp / ps, qty, unit: selectedUnit, packPrice: pp, packSize: ps });
  renderCurrentItems();
  document.getElementById('f-name').value       = '';
  document.getElementById('f-pack-price').value = '';
  document.getElementById('f-pack-size').value  = '1';
  document.getElementById('f-qty').value        = '1';
  document.getElementById('unit-price-box').classList.add('hidden');
  document.getElementById('f-name').focus();
  hideSugg();
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
  const data     = { version: 1, stores: savedStores, invoices };
  const blob     = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `prices-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('📤 تم تصدير البيانات');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.invoices || !Array.isArray(data.invoices))
        throw new Error('ملف غير صالح');

      if (!confirm(`استيراد ${data.invoices.length} فاتورة؟\nسيتم إضافتها مع البيانات الحالية.`)) return;

      for (const inv of data.invoices) {
        const { id, ...invData } = inv;
        await dbAdd(invData);
      }

      if (data.stores && Array.isArray(data.stores)) {
        data.stores.forEach(s => { if (!savedStores.includes(s)) savedStores.push(s); });
        saveStores(savedStores);
      }

      await reload();
      toast(`✅ تم استيراد ${data.invoices.length} فاتورة`);
    } catch {
      toast('⚠️ خطأ في قراءة الملف');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ══════════════════════════════════════
//  اقتراحات
// ══════════════════════════════════════
function showSugg(val) {
  const box = document.getElementById('suggestions');
  if (!val.trim()) { hideSugg(); return; }
  const known = new Set();
  for (const inv of allInvoices)
    for (const item of (inv.items || []))
      known.add(item.name.trim());
  const matches = [...known].filter(n => n.includes(val.trim())).slice(0, 5);
  if (!matches.length) { hideSugg(); return; }
  box.innerHTML = matches.map(m =>
    `<div class="sugg-item" onclick="pickSugg('${m.replace(/'/g,"\\'")}')"> ${h(m)}</div>`
  ).join('');
  box.classList.remove('hidden');
}
function hideSugg() { document.getElementById('suggestions').classList.add('hidden'); }
function pickSugg(name) {
  document.getElementById('f-name').value = name;
  hideSugg();
  document.getElementById('f-pack-price').focus();
}

// ══════════════════════════════════════
//  Toast
// ══════════════════════════════════════
let toastTmr;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => el.classList.remove('show'), 2300);
}

// ══════════════════════════════════════
//  الأحداث
// ══════════════════════════════════════
function setupEvents() {
  // تنقل
  document.getElementById('btn-go-add').addEventListener('click',       openAdd);
  document.getElementById('btn-empty-add').addEventListener('click',    openAdd);
  document.getElementById('btn-go-stores').addEventListener('click',    openStoresMgr);
  document.getElementById('btn-back-stores').addEventListener('click',  () => show('screen-home'));
  document.getElementById('btn-back-compare').addEventListener('click', () => show('screen-home'));
  document.getElementById('btn-back-add').addEventListener('click',     () => show('screen-home'));
  document.getElementById('btn-back-invoice').addEventListener('click', () => show('screen-compare'));
  document.getElementById('btn-delete-invoice').addEventListener('click', deleteCurrentInvoice);

  // صورة
  document.getElementById('img-upload').addEventListener('change',    onImageUpload);
  document.getElementById('btn-remove-img').addEventListener('click', removeImg);

  // محل جديد في نموذج الفاتورة
  document.getElementById('btn-confirm-store').addEventListener('click', confirmNewStore);
  document.getElementById('f-new-store').addEventListener('keydown', e => { if (e.key === 'Enter') confirmNewStore(); });

  // إدارة المحلات
  document.getElementById('btn-add-store-mgr').addEventListener('click', addStoreMgr);
  document.getElementById('f-new-store-mgr').addEventListener('keydown', e => { if (e.key === 'Enter') addStoreMgr(); });

  // أزرار الوحدة
  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedUnit = btn.dataset.unit;
      document.getElementById('pack-size-label').textContent = btn.dataset.label;
      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      calcUnitPrice();
    });
  });

  // حساب تلقائي
  document.getElementById('f-pack-price').addEventListener('input', calcUnitPrice);
  document.getElementById('f-pack-size').addEventListener('input',  calcUnitPrice);

  // إضافة صنف
  document.getElementById('btn-add-item').addEventListener('click', addItem);
  document.getElementById('f-pack-price').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });

  // حفظ فاتورة
  document.getElementById('btn-save').addEventListener('click', saveInvoice);

  // تصدير واستيراد
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import-trigger').addEventListener('click', () =>
    document.getElementById('btn-import').click());
  document.getElementById('btn-import').addEventListener('change', importData);

  // اقتراحات
  document.getElementById('f-name').addEventListener('input', e => showSugg(e.target.value));
  document.getElementById('f-name').addEventListener('blur',  () => setTimeout(hideSugg, 200));
}

// ══════════════════════════════════════
//  تشغيل
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);

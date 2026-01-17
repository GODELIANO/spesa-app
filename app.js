// =========================
// Spesa App - app.js
// =========================

// ---- DOM ----
const form = document.getElementById("form");
const input = document.getElementById("input");
const listEl = document.getElementById("list");
const clearDoneBtn = document.getElementById("clearDone");
const clearAllBtn = document.getElementById("clearAll");
const shareBtn = document.getElementById("shareList");       // opzionale
const keepAwakeBtn = document.getElementById("keepAwake");   // opzionale
const recatAllBtn = document.getElementById("recatAll");     // opzionale (ma consigliato)

if (!form || !input || !listEl || !clearDoneBtn || !clearAllBtn) {
  console.log({ form, input, listEl, clearDoneBtn, clearAllBtn, shareBtn, keepAwakeBtn, recatAllBtn });
  throw new Error("Mancano uno o più elementi base in index.html (ID).");
}

const STORAGE_KEY = "spesa_items_v2";
const ALIASES_KEY = "spesa_aliases_v1";

// -------------------------
// Text normalization + tokenization + light IT stemming
// -------------------------
function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const t = normalizeText(s);
  return t ? t.split(" ") : [];
}

function stemIt(word) {
  let w = (word || "").toLowerCase().replace(/'/g, "");
  if (w.length > 3) w = w.replace(/(i|e)$/i, ""); // plurali
  w = w.replace(/che$/i, "c").replace(/ghe$/i, "g");
  return w;
}

function stemsFromText(text) {
  return tokenize(text).map(stemIt).filter(Boolean);
}

// -------------------------
// 4) Categories (rules)
// -------------------------
const CATEGORIES = [
  { key: "produce",   label: "Frutta & Verdura", icon: "🥬",
    stems: ["insalat","lattug","rucol","pomodor","zucchin","melanzan","patat","carot","cipoll","agli","limon","banan","mel","per","fragol","ananas","aranc","mandarin","cetriol","peperon","broccol","cavolfior","spinac","fung","verdur","frutt"]
  },
  { key: "meat",      label: "Carne",            icon: "🥩",
    stems: ["carn","poll","tacchin","manz","vitell","maial","bistec","salsicc","prosciutt","salam","wurstel","bacon","speck"]
  },
  { key: "fish",      label: "Pesce",            icon: "🐟",
    stems: ["pesc","tonn","salm","merluzz","gamber","calamar","vongol","orat","branzin","acciugh","sard"]
  },
  { key: "dairy",     label: "Latticini",        icon: "🥛",
    stems: ["latt","yogurt","burr","pann","mozzarell","ricott","parmigian","gran","formagg","kefir"]
  },
  { key: "bakery",    label: "Pane & Forno",     icon: "🥖",
    stems: ["pan","panin","focacc","pizz","cracker","biscott","cornett","farin","lievit","grissin","brioch"]
  },
  { key: "pantry",    label: "Dispensa",         icon: "🫙",
    stems: ["past","ris","oli","acet","sal","zuccher","caffe","te","leggum","cec","lent","fagiol","sug","passat","pelat","spezi","conserv","brod"]
  },
  { key: "frozen",    label: "Surgelati",        icon: "🧊",
    stems: ["surgelat","gelat","frozen","pisell","bastonc"]
  },
  { key: "household", label: "Casa",             icon: "🧽",
    stems: ["detersiv","sapon","candeggin","spugn","cart","igienic","scottex","sacchett","lavastovigl","ammorbident","pulitor","sgrassator","guant"]
  },
  { key: "personal",  label: "Persona",          icon: "🧴",
    stems: ["shampoo","bagnoschium","deodorant","dentifric","spazzolin","raso","crem","assorbent"]
  },
  { key: "pet",       label: "Animali",          icon: "🐾",
    stems: ["crocchett","lettier","gatt","can","mangim","snack"]
  },
  { key: "other",     label: "Altro",            icon: "📝", stems: [] },
];

function catMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

function stemMatches(tokenStem, categoryStem) {
  if (!tokenStem || !categoryStem) return false;
  if (tokenStem === categoryStem) return true;
  if (tokenStem.startsWith(categoryStem)) return true;
  if (categoryStem.startsWith(tokenStem) && tokenStem.length >= 4) return true;
  return false;
}

// -------------------------
// ✅ Learning: Aliases
// -------------------------
let aliases = loadAliases();

function loadAliases() {
  try {
    const raw = localStorage.getItem(ALIASES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
}

function persistAliases() {
  localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
}

// Regola conservativa:
// - salva sempre alias per l'intera frase normalizzata
// - se è una sola parola, salva anche alias per quella parola
function learnAlias(text, categoryKey) {
  const norm = normalizeText(text);
  if (!norm) return;
  aliases[`p:${norm}`] = categoryKey; // phrase
  const toks = tokenize(norm);
  if (toks.length === 1) {
    aliases[`w:${toks[0]}`] = categoryKey; // single word
  }
  persistAliases();
}

// Consulta alias prima delle regole
function aliasCategory(text) {
  const norm = normalizeText(text);
  if (!norm) return null;
  const phraseKey = `p:${norm}`;
  if (aliases[phraseKey]) return aliases[phraseKey];

  const toks = tokenize(norm);
  if (toks.length === 1) {
    const wordKey = `w:${toks[0]}`;
    if (aliases[wordKey]) return aliases[wordKey];
  }
  return null;
}

// inferCategory: alias -> regole
function inferCategory(text) {
  const fromAlias = aliasCategory(text);
  if (fromAlias) return fromAlias;

  const stems = stemsFromText(text);
  for (const c of CATEGORIES) {
    if (c.key === "other") continue;
    if (!c.stems?.length) continue;

    for (const s of stems) {
      if (s.length < 3) continue;
      if (c.stems.some((cs) => stemMatches(s, cs))) return c.key;
    }
  }
  return "other";
}

// -------------------------
// Helpers / storage
// -------------------------
function makeId() {
  return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((i) => ({
      id: i.id ?? makeId(),
      text: String(i.text ?? ""),
      done: Boolean(i.done),
      qty: Number.isFinite(i.qty) ? i.qty : 1,
      category: i.category ? String(i.category) : inferCategory(String(i.text ?? "")),
      createdAt: Number.isFinite(i.createdAt) ? i.createdAt : Date.now(),
    }));
  } catch {
    return [];
  }
}

// -------------------------
// Grouping
// -------------------------
function groupItems(arr) {
  const order = new Map(CATEGORIES.map((c, idx) => [c.key, idx]));
  const buckets = new Map();

  for (const it of arr) {
    const k = it.category || "other";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }

  for (const [, itemsArr] of buckets) itemsArr.sort((a, b) => a.createdAt - b.createdAt);

  return [...buckets.entries()].sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999));
}

// -------------------------
// Qty parsing
// -------------------------
function clampQty(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(99, n));
}

function parseQty(raw) {
  const t = raw.trim();
  const m1 = t.match(/^(.*?)(?:\s*[x×]\s*)(\d{1,2})\s*$/i);
  if (m1) return { text: (m1[1].trim() || raw), qty: clampQty(parseInt(m1[2], 10)) };

  const m2 = t.match(/^(.*?)(?:\s+)(\d{1,2})\s*$/);
  if (m2) return { text: (m2[1].trim() || raw), qty: clampQty(parseInt(m2[2], 10)) };

  return { text: raw, qty: 1 };
}

// -------------------------
// ✅ Focus/scroll fix helpers
// -------------------------
// Evita che tocchi su checkbox/bottoni spostino il focus (e aprano tastiera su mobile)
function preventFocus(e) {
  e.preventDefault();
}

// -------------------------
// State + boot
// -------------------------
let items = loadItems();
render();

// -------------------------
// Actions
// -------------------------
function removeItem(id) {
  items = items.filter((i) => i.id !== id);
  persist();
  render();
}

function toggleDone(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  it.done = !it.done;
  persist();
  render();
}

function changeQty(id, delta) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  it.qty = clampQty((it.qty ?? 1) + delta);
  persist();
  render();
}

// Cambia categoria manualmente e “impara”
function setCategory(id, categoryKey) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  it.category = categoryKey;
  learnAlias(it.text, categoryKey);
  persist();
  render();
}

// Ricategorizza tutto (usa alias -> regole)
function recategorizeAll() {
  items = items.map((it) => ({
    ...it,
    category: inferCategory(it.text),
  }));
  persist();
  render();
}

// -------------------------
// Events
// -------------------------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  if (!raw) return;

  const parsed = parseQty(raw);
  const finalText = parsed.text;

  items.push({
    id: makeId(),
    text: finalText,
    done: false,
    qty: parsed.qty,
    category: inferCategory(finalText),
    createdAt: Date.now(),
  });

  input.value = "";
  persist();
  render();

  // ✅ Focus solo quando aggiungi un item (non quando spunti!)
  input.focus();
});

clearDoneBtn.addEventListener("click", () => {
  items = items.filter((i) => !i.done);
  persist();
  render();
});

clearAllBtn.addEventListener("click", () => {
  items = [];
  persist();
  render();
});

if (recatAllBtn) {
  recatAllBtn.addEventListener("click", () => recategorizeAll());
}

// -------------------------
// Share (optional)
// -------------------------
if (shareBtn) {
  shareBtn.addEventListener("click", async () => {
    const text = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Lista spesa", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        alert("Lista copiata negli appunti.");
      } else {
        prompt("Copia la lista:", text);
      }
    } catch (err) {
      console.log("Share cancelled/failed:", err);
    }
  });
}

function buildShareText() {
  const open = items.filter((i) => !i.done);
  if (open.length === 0) return "Lista spesa vuota 🙂";

  const grouped = groupItems(open);
  let out = "🛒 Lista spesa\n";
  for (const [catKey, arr] of grouped) {
    const m = catMeta(catKey);
    out += `\n${m.icon} ${m.label}\n`;
    for (const it of arr) out += `- ${it.text}${it.qty > 1 ? ` ×${it.qty}` : ""}\n`;
  }
  return out.trim();
}

// -------------------------
// Wake Lock (optional)
// -------------------------
let wakeLock = null;

if (keepAwakeBtn) {
  keepAwakeBtn.addEventListener("click", async (e) => {
    // evita focus/scroll strani
    preventFocus(e);

    const pressed = keepAwakeBtn.getAttribute("aria-pressed") === "true";
    if (pressed) await releaseWakeLock();
    else await requestWakeLock();
    updateKeepAwakeUI();
  });

  document.addEventListener("visibilitychange", async () => {
    const wantOn = keepAwakeBtn.getAttribute("aria-pressed") === "true";
    if (!wantOn) return;
    if (document.visibilityState === "visible" && !wakeLock) {
      await requestWakeLock();
      updateKeepAwakeUI();
    }
  });

  updateKeepAwakeUI();
}

async function requestWakeLock() {
  try {
    if (!("wakeLock" in navigator)) {
      alert("Modalità negozio non supportata su questo browser/dispositivo.");
      return;
    }
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) {
    console.log("Wake lock error:", e);
    alert("Non riesco ad attivare lo schermo sempre acceso.");
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } catch {}
  wakeLock = null;
}

function updateKeepAwakeUI() {
  if (!keepAwakeBtn) return;
  const on = Boolean(wakeLock);
  keepAwakeBtn.setAttribute("aria-pressed", on ? "true" : "false");
  keepAwakeBtn.textContent = on ? "Modalità negozio: ON" : "Modalità negozio";
}

// -------------------------
// UI
// -------------------------
function render() {
  listEl.innerHTML = "";

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const groupedOpen = groupItems(open);

  for (const [catKey, arr] of groupedOpen) {
    const m = catMeta(catKey);
    const header = document.createElement("li");
    header.className = "cat-header";
    header.textContent = `${m.icon} ${m.label}`;
    listEl.appendChild(header);

    for (const it of arr) listEl.appendChild(renderItem(it));
  }

  if (done.length > 0) {
    const sep = document.createElement("li");
    sep.className = "cat-sep";
    sep.textContent = "✅ Spuntati";
    listEl.appendChild(sep);

    done.sort((a, b) => a.createdAt - b.createdAt);
    for (const it of done) listEl.appendChild(renderItem(it));
  }

  // ❌ NIENTE input.focus() QUI
  // Altrimenti quando spunti un elemento ti apre la tastiera e ti manda su.
}

function renderItem(it) {
  const li = document.createElement("li");
  li.className = "item" + (it.done ? " done" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = it.done;

  // ✅ evita focus/scroll strani su mobile quando tocchi la checkbox
  cb.addEventListener("pointerdown", preventFocus);

  cb.addEventListener("change", () => toggleDone(it.id));

  const span = document.createElement("span");
  span.className = "text";
  span.textContent = it.text;

  // quantità
  const qtyWrap = document.createElement("div");
  qtyWrap.className = "qty";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "qty-btn";
  minus.textContent = "–";
  minus.addEventListener("pointerdown", preventFocus);
  minus.addEventListener("click", () => changeQty(it.id, -1));

  const qty = document.createElement("span");
  qty.className = "qty-val";
  qty.textContent = String(it.qty ?? 1);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "qty-btn";
  plus.textContent = "+";
  plus.addEventListener("pointerdown", preventFocus);
  plus.addEventListener("click", () => changeQty(it.id, +1));

  qtyWrap.appendChild(minus);
  qtyWrap.appendChild(qty);
  qtyWrap.appendChild(plus);

  // ✅ menu categoria (manuale -> salva alias)
  const select = document.createElement("select");
  select.className = "cat-select";
  select.addEventListener("pointerdown", preventFocus); // opzionale, ma aiuta su mobile

  for (const c of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = `${c.icon} ${c.label}`;
    if ((it.category || "other") === c.key) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => setCategory(it.id, select.value));

  // delete singolo
  const del = document.createElement("button");
  del.type = "button";
  del.className = "del";
  del.textContent = "×";
  del.addEventListener("pointerdown", preventFocus);
  del.addEventListener("click", () => removeItem(it.id));

  li.appendChild(cb);
  li.appendChild(span);
  li.appendChild(qtyWrap);
  li.appendChild(select);
  li.appendChild(del);

  return li;
}

// -------------------------
// Service Worker (offline)
// -------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.log("SW register error:", err);
    });
  });
}

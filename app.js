// ---- DOM ----
const form = document.getElementById("form");
const input = document.getElementById("input");
const listEl = document.getElementById("list");
const clearDoneBtn = document.getElementById("clearDone");
const clearAllBtn = document.getElementById("clearAll");
const shareBtn = document.getElementById("shareList");
const keepAwakeBtn = document.getElementById("keepAwake");

if (!form || !input || !listEl || !clearDoneBtn || !clearAllBtn || !shareBtn || !keepAwakeBtn) {
  console.log({ form, input, listEl, clearDoneBtn, clearAllBtn, shareBtn, keepAwakeBtn });
  throw new Error("Mancano uno o più elementi in index.html (ID).");
}

const STORAGE_KEY = "spesa_items_v2";

// items: [{ id, text, done, qty, category, createdAt }]
let items = loadItems();
render();

// ---- Categorie automatiche ----
// Regola: prima match vince. Aggiungi keyword a piacere.
const CATEGORIES = [
  { key: "produce", label: "Frutta & Verdura", icon: "🥬", keywords: ["insalata","lattuga","pomodoro","zucchina","melanzana","patata","carota","cipolla","aglio","limone","banana","mela","pere","fragole","frutta","verdura","broccoli","spinaci","arancia","cetriolo"] },
  { key: "meat", label: "Carne", icon: "🥩", keywords: ["carne","pollo","tacchino","manzo","vitello","maiale","bistecca","salsiccia","prosciutto","salame","wurstel","bacon","speck"] },
  { key: "fish", label: "Pesce", icon: "🐟", keywords: ["pesce","tonno","salmone","merluzzo","gamberi","calamari","vongole","orata","branzino"] },
  { key: "dairy", label: "Latticini", icon: "🥛", keywords: ["latte","yogurt","burro","panna","mozzarella","ricotta","parmigiano","grana","formaggio"] },
  { key: "bakery", label: "Pane & Forno", icon: "🥖", keywords: ["pane","panini","focaccia","pizza","cracker","biscotti","cornetti","farina","lievito"] },
  { key: "pantry", label: "Dispensa", icon: "🫙", keywords: ["pasta","riso","olio","aceto","sale","zucchero","caffè","tè","legumi","ceci","lenticchie","fagioli","sugo","passata","pomodori pelati","spezie"] },
  { key: "frozen", label: "Surgelati", icon: "🧊", keywords: ["surgelati","gelato","frozen","piselli surgelati","bastoncini"] },
  { key: "household", label: "Casa", icon: "🧽", keywords: ["detersivo","sapone","candeggina","spugna","carta igienica","scottex","sacchetti","lavastoviglie","ammorbidente","pulitore","sgrassatore"] },
  { key: "personal", label: "Persona", icon: "🧴", keywords: ["shampoo","bagnoschiuma","deodorante","dentifricio","spazzolino","rasoio","crema"] },
  { key: "pet", label: "Animali", icon: "🐾", keywords: ["crocchette","cibo gatto","cibo cane","lettiera","snack cane","snack gatto"] },
  { key: "other", label: "Altro", icon: "📝", keywords: [] },
];

function inferCategory(text) {
  const t = (text || "").toLowerCase();
  for (const c of CATEGORIES) {
    if (c.key === "other") continue;
    if (c.keywords.some(k => t.includes(k))) return c.key;
  }
  return "other";
}

function catMeta(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

// ---- Helpers ----
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
    // Migrazione “gentile”: aggiunge campi mancanti
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

function removeItem(id) {
  items = items.filter(i => i.id !== id);
  persist();
  render();
}

function toggleDone(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  it.done = !it.done;
  persist();
  render();
}

function changeQty(id, delta) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const next = (it.qty ?? 1) + delta;
  it.qty = Math.max(1, Math.min(99, next)); // 1..99
  persist();
  render();
}

// ---- Eventi principali ----
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  // Supporto opzionale: "latte x2" o "latte 2"
  const parsed = parseQty(text);

  const finalText = parsed.text;
  const qty = parsed.qty;

  items.push({
    id: makeId(),
    text: finalText,
    done: false,
    qty,
    category: inferCategory(finalText),
    createdAt: Date.now(),
  });

  input.value = "";
  persist();
  render();
});

clearDoneBtn.addEventListener("click", () => {
  items = items.filter(i => !i.done);
  persist();
  render();
});

clearAllBtn.addEventListener("click", () => {
  items = [];
  persist();
  render();
});

// ---- 6) Condivisione ----
shareBtn.addEventListener("click", async () => {
  const text = buildShareText();
  try {
    if (navigator.share) {
      await navigator.share({
        title: "Lista spesa",
        text,
      });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      alert("Lista copiata negli appunti.");
    } else {
      // fallback super basic
      prompt("Copia la lista:", text);
    }
  } catch (err) {
    // l'utente può annullare la share: non è un errore “vero”
    console.log("Share cancelled or failed:", err);
  }
});

function buildShareText() {
  const open = items.filter(i => !i.done);
  if (open.length === 0) return "Lista spesa vuota 🙂";

  // raggruppa come UI
  const grouped = groupItems(open);
  let out = "🛒 Lista spesa\n";
  for (const [catKey, arr] of grouped) {
    const m = catMeta(catKey);
    out += `\n${m.icon} ${m.label}\n`;
    for (const it of arr) {
      out += `- ${it.text}${it.qty > 1 ? ` ×${it.qty}` : ""}\n`;
    }
  }
  return out.trim();
}

// ---- 7) Modalità negozio (Wake Lock) ----
let wakeLock = null;

keepAwakeBtn.addEventListener("click", async () => {
  const pressed = keepAwakeBtn.getAttribute("aria-pressed") === "true";
  if (pressed) {
    await releaseWakeLock();
  } else {
    await requestWakeLock();
  }
  updateKeepAwakeUI();
});

async function requestWakeLock() {
  try {
    if (!("wakeLock" in navigator)) {
      alert("Modalità negozio non supportata su questo browser/dispositivo.");
      return;
    }
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) {
    console.log("Wake lock error:", e);
    alert("Non riesco ad attivare lo schermo sempre acceso (permessi o supporto limitato).");
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } catch {}
  wakeLock = null;
}

function updateKeepAwakeUI() {
  const on = Boolean(wakeLock);
  keepAwakeBtn.setAttribute("aria-pressed", on ? "true" : "false");
  keepAwakeBtn.textContent = on ? "Modalità negozio: ON" : "Modalità negozio";
}

// Se la pagina perde visibilità, su alcuni device il wake lock cade: proviamo a riprenderlo
document.addEventListener("visibilitychange", async () => {
  const wantOn = keepAwakeBtn.getAttribute("aria-pressed") === "true";
  if (!wantOn) return;
  if (document.visibilityState === "visible" && !wakeLock) {
    await requestWakeLock();
    updateKeepAwakeUI();
  }
});

// ---- Parsing quantità da input (opzionale ma utile) ----
// esempi: "latte x2", "latte ×2", "latte 2"
function parseQty(raw) {
  const t = raw.trim();

  // pattern "x2" / "×2"
  const m1 = t.match(/^(.*?)(?:\s*[x×]\s*)(\d{1,2})\s*$/i);
  if (m1) {
    const text = m1[1].trim();
    const qty = clampQty(parseInt(m1[2], 10));
    return { text: text || raw, qty };
  }

  // pattern "latte 2" (numero finale)
  const m2 = t.match(/^(.*?)(?:\s+)(\d{1,2})\s*$/);
  if (m2) {
    const text = m2[1].trim();
    const qty = clampQty(parseInt(m2[2], 10));
    // Evita casi tipo "acqua 1.5L" (non gestiamo decimali): qui non matcha perché solo intero.
    return { text: text || raw, qty };
  }

  return { text: raw, qty: 1 };
}

function clampQty(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(99, n));
}

// ---- 4) Raggruppamento per categoria + ordinamento ----
function groupItems(arr) {
  // ordine categorie come in CATEGORIES
  const order = new Map(CATEGORIES.map((c, idx) => [c.key, idx]));
  const buckets = new Map();

  for (const it of arr) {
    const k = it.category || "other";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }

  // ordina items dentro categoria: non spuntati (qui sono tutti aperti) e per createdAt
  for (const [, itemsArr] of buckets) {
    itemsArr.sort((a, b) => a.createdAt - b.createdAt);
  }

  // ritorna array di [catKey, items[]] ordinato
  return [...buckets.entries()].sort((a, b) => {
    return (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999);
  });
}

// ---- UI ----
function render() {
  listEl.innerHTML = "";

  const open = items.filter(i => !i.done);
  const done = items.filter(i => i.done);

  // 4) raggruppa gli aperti per categoria
  const groupedOpen = groupItems(open);

  for (const [catKey, arr] of groupedOpen) {
    const m = catMeta(catKey);

    // header categoria
    const header = document.createElement("li");
    header.className = "cat-header";
    header.textContent = `${m.icon} ${m.label}`;
    listEl.appendChild(header);

    for (const it of arr) {
      listEl.appendChild(renderItem(it));
    }
  }

  // separatore “Spuntati”
  if (done.length > 0) {
    const sep = document.createElement("li");
    sep.className = "cat-sep";
    sep.textContent = "✅ Spuntati";
    listEl.appendChild(sep);

    done.sort((a, b) => a.createdAt - b.createdAt);
    for (const it of done) {
      listEl.appendChild(renderItem(it));
    }
  }

  input.focus();
}

function renderItem(it) {
  const li = document.createElement("li");
  li.className = "item" + (it.done ? " done" : "");

  // checkbox
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = it.done;
  cb.addEventListener("change", () => toggleDone(it.id));

  // testo
  const span = document.createElement("span");
  span.className = "text";
  span.textContent = it.text;

  // 5) quantità con - / + (solo se non spuntato? qui lo lasciamo sempre)
  const qtyWrap = document.createElement("div");
  qtyWrap.className = "qty";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "qty-btn";
  minus.textContent = "–";
  minus.addEventListener("click", () => changeQty(it.id, -1));

  const qty = document.createElement("span");
  qty.className = "qty-val";
  qty.textContent = String(it.qty ?? 1);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "qty-btn";
  plus.textContent = "+";
  plus.addEventListener("click", () => changeQty(it.id, +1));

  qtyWrap.appendChild(minus);
  qtyWrap.appendChild(qty);
  qtyWrap.appendChild(plus);

  // 2) delete singolo
  const del = document.createElement("button");
  del.type = "button";
  del.className = "del";
  del.textContent = "×";
  del.addEventListener("click", () => removeItem(it.id));

  li.appendChild(cb);
  li.appendChild(span);
  li.appendChild(qtyWrap);
  li.appendChild(del);

  return li;
}

// ---- Service Worker (offline) ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.log("SW register error:", err);
    });
  });
}


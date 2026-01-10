// =========================
// Spesa App - app.js (improved categorization)
// Features: delete, auto categories+grouping, qty +/- , share, wake lock, offline
// =========================

// ---- DOM ----
const form = document.getElementById("form");
const input = document.getElementById("input");
const listEl = document.getElementById("list");
const clearDoneBtn = document.getElementById("clearDone");
const clearAllBtn = document.getElementById("clearAll");
const shareBtn = document.getElementById("shareList");     // opzionale se HTML non aggiornato
const keepAwakeBtn = document.getElementById("keepAwake"); // opzionale se HTML non aggiornato

if (!form || !input || !listEl || !clearDoneBtn || !clearAllBtn) {
  console.log({ form, input, listEl, clearDoneBtn, clearAllBtn, shareBtn, keepAwakeBtn });
  throw new Error("Mancano uno o più elementi base in index.html (ID).");
}

const STORAGE_KEY = "spesa_items_v2";

// -------------------------
// Text normalization + tokenization + light Italian stemming
// -------------------------
function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")                  // separa accenti
    .replace(/[\u0300-\u036f]/g, "")   // rimuove accenti
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // rimuove punteggiatura (unicode-safe)
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const t = normalizeText(s);
  return t ? t.split(" ") : [];
}

// Stemmer leggero IT: mira alla spesa (non linguistica perfetta).
// Obiettivo: ridurre plurali e varianti comuni a una radice stabile.
function stemIt(word) {
  let w = (word || "").toLowerCase();

  // rimuovi apostrofi residui
  w = w.replace(/'/g, "");

  // normalizza articoli agganciati tipo "lacqua" da "l'acqua" (già ripulito in normalizeText)
  // qui non facciamo split extra: lo gestiamo con tokenizzazione.

  // tagli molto comuni (plurali)
  // mele -> mel, pomodori -> pomodor, carote -> carot, banane -> banan
  if (w.length > 3) w = w.replace(/(i|e)$/i, "");

  // gestisci -che/-ghe (es. "pesche" -> "pesc" dopo taglio e -> "pesch" poi che->c)
  w = w.replace(/che$/i, "c").replace(/ghe$/i, "g");

  // riduzioni finali molto comuni (facoltative, conservative)
  // es: "mozzarell" resta ok, "parmigian" ok.
  return w;
}

function stemsFromText(text) {
  return tokenize(text).map(stemIt).filter(Boolean);
}

// -------------------------
// 4) Categorie automatiche: match su stems
// -------------------------
const CATEGORIES = [
  {
    key: "produce",
    label: "Frutta & Verdura",
    icon: "🥬",
    stems: [
      "insalat","lattug","rucol","pomodor","zucchin","melanzan","patat","carot","cipoll","agli",
      "limon","banan","mel","per","fragol","kiw","ananas","aranc","mandarin","cetriol","peperon",
      "broccol","cavolfior","spinac","fung","zener","zuccherin", "verdur", "frutt"
    ],
  },
  {
    key: "meat",
    label: "Carne",
    icon: "🥩",
    stems: ["carn","poll","tacchin","manz","vitell","maial","bistec","salsicc","prosciutt","salam","wurstel","bacon","speck"],
  },
  {
    key: "fish",
    label: "Pesce",
    icon: "🐟",
    stems: ["pesc","tonn","salm","merluzz","gamber","calamar","vongol","orat","branzin","acciugh","sard"],
  },
  {
    key: "dairy",
    label: "Latticini",
    icon: "🥛",
    stems: ["latt","yogurt","burr","pann","mozzarell","ricott","parmigian","gran","formagg","latte","kefir"],
  },
  {
    key: "bakery",
    label: "Pane & Forno",
    icon: "🥖",
    stems: ["pan","panin","focacc","pizz","cracker","biscott","cornett","farin","lievit","grissin","brioch"],
  },
  {
    key: "pantry",
    label: "Dispensa",
    icon: "🫙",
    stems: ["past","ris","oli","acet","sal","zuccher","caffe","te","leggum","cec","lent","fagiol","sug","passat","pelat","spezi","tonn","conserv","brod"],
  },
  {
    key: "frozen",
    label: "Surgelati",
    icon: "🧊",
    stems: ["surgelat","gelat","frozen","pisell","bastonc","spinac"],
  },
  {
    key: "household",
    label: "Casa",
    icon: "🧽",
    stems: ["detersiv","sapon","candeggin","spugn","cart","igienic","scottex","sacchett","lavastovigl","ammorbident","pulitor","sgrassator","spazzol","guant"],
  },
  {
    key: "personal",
    label: "Persona",
    icon: "🧴",
    stems: ["shampoo","bagnoschium","deodorant","dentifric","spazzolin","raso","crem","sapone","cotton","assorbent"],
  },
  {
    key: "pet",
    label: "Animali",
    icon: "🐾",
    stems: ["crocchett","lettier","gatt","can","mangim","snack"],
  },
  {
    key: "other",
    label: "Altro",
    icon: "📝",
    stems: [],
  },
];

function catMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

// Matching più tollerante: exact OR prefix match (in entrambe le direzioni).
function stemMatchesCategoryStem(tokenStem, categoryStem) {
  if (!tokenStem || !categoryStem) return false;
  if (tokenStem === categoryStem) return true;
  // tolleranza: "pomodor" matcha "pomodor", ma anche "pomodoro" -> "pomodor"
  if (tokenStem.startsWith(categoryStem)) return true;
  if (categoryStem.startsWith(tokenStem) && tokenStem.length >= 4) return true;
  return false;
}

function inferCategory(text) {
  const stems = stemsFromText(text);

  for (const c of CATEGORIES) {
    if (c.key === "other") continue;
    if (!c.stems || c.stems.length === 0) continue;

    for (const s of stems) {
      if (s.length < 3) continue;
      // se QUALSIASI stem dell'item matcha QUALSIASI stem della categoria -> match
      if (c.stems.some((cs) => stemMatchesCategoryStem(s, cs))) {
        return c.key;
      }
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
    // migrazione campi mancanti
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
// 4) Raggruppamento per categoria (ordine = CATEGORIES)
// -------------------------
function groupItems(arr) {
  const order = new Map(CATEGORIES.map((c, idx) => [c.key, idx]));
  const buckets = new Map();

  for (const it of arr) {
    const k = it.category || "other";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }

  // ordina per inserimento (createdAt)
  for (const [, itemsArr] of buckets) {
    itemsArr.sort((a, b) => a.createdAt - b.createdAt);
  }

  // ordina i gruppi secondo CATEGORIES
  return [...buckets.entries()].sort((a, b) => {
    return (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999);
  });
}

// -------------------------
// 5) Parsing quantità da input
// -------------------------
function clampQty(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(99, n));
}

function parseQty(raw) {
  const t = raw.trim();

  // "latte x2" / "latte ×2"
  const m1 = t.match(/^(.*?)(?:\s*[x×]\s*)(\d{1,2})\s*$/i);
  if (m1) {
    const text = m1[1].trim();
    const qty = clampQty(parseInt(m1[2], 10));
    return { text: text || raw, qty };
  }

  // "latte 2" (numero finale)
  const m2 = t.match(/^(.*?)(?:\s+)(\d{1,2})\s*$/);
  if (m2) {
    const text = m2[1].trim();
    const qty = clampQty(parseInt(m2[2], 10));
    return { text: text || raw, qty };
  }

  return { text: raw, qty: 1 };
}

// -------------------------
// Stato + boot
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
  const next = (it.qty ?? 1) + delta;
  it.qty = clampQty(next);
  persist();
  render();
}

// -------------------------
// Eventi: aggiunta / clear
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

// -------------------------
// 6) Condivisione (se bottone c'è)
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
    for (const it of arr) {
      out += `- ${it.text}${it.qty > 1 ? ` ×${it.qty}` : ""}\n`;
    }
  }
  return out.trim();
}

// -------------------------
// 7) Modalità negozio (Wake Lock) - se bottone c'è
// -------------------------
let wakeLock = null;

if (keepAwakeBtn) {
  keepAwakeBtn.addEventListener("click", async () => {
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

  // gruppi aperti
  for (const [catKey, arr] of groupedOpen) {
    const m = catMeta(catKey);
    const header = document.createElement("li");
    header.className = "cat-header";
    header.textContent = `${m.icon} ${m.label}`;
    listEl.appendChild(header);

    for (const it of arr) {
      listEl.appendChild(renderItem(it));
    }
  }

  // separatore spuntati
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

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = it.done;
  cb.addEventListener("change", () => toggleDone(it.id));

  const span = document.createElement("span");
  span.className = "text";
  span.textContent = it.text;

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

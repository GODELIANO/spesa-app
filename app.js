// ---- Elementi DOM ----
const form = document.getElementById("form");
const input = document.getElementById("input");
const listEl = document.getElementById("list");
const clearDoneBtn = document.getElementById("clearDone");
const clearAllBtn = document.getElementById("clearAll");

// Se qualcosa non esiste, blocchiamo subito con un errore chiaro
if (!form || !input || !listEl || !clearDoneBtn || !clearAllBtn) {
  console.log({ form, input, listEl, clearDoneBtn, clearAllBtn });
  throw new Error("Mancano uno o più elementi in index.html (ID sbagliati).");
}

const STORAGE_KEY = "spesa_items_v1";

// items: [{ id, text, done, createdAt }]
let items = loadItems();
render();

// ---- Helpers ----
function makeId() {
  // compatibile ovunque
  return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- Eventi ----
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = input.value.trim();
  if (!text) return;

  items.push({
    id: makeId(),
    text,
    done: false,
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

// ---- UI ----
function toggleDone(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;

  it.done = !it.done;
  persist();
  render();
}

function render() {
  // regola: non spuntati sopra, spuntati sotto
  const sorted = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.createdAt - b.createdAt;
  });

  listEl.innerHTML = "";

  for (const it of sorted) {
    const li = document.createElement("li");
    li.className = "item" + (it.done ? " done" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = it.done;
    cb.addEventListener("change", () => toggleDone(it.id));

    const span = document.createElement("span");
    span.className = "text";
    span.textContent = it.text;

    li.appendChild(cb);
    li.appendChild(span);
    listEl.appendChild(li);
  }

  input.focus();
}

// ---- Service Worker (offline) ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((err) => console.log("SW register error:", err));
  });
}

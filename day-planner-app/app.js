import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* ---------- constants ---------- */
const DURATIONS = [15, 30, 45, 60, 90, 120];
const PRIORITIES = [
  { value: null, label: "None", color: "#8C887C" },
  { value: "low", label: "Low", color: "#5C7A5E" },
  { value: "medium", label: "Medium", color: "#C98A2A" },
  { value: "high", label: "High", color: "#C0293D" },
];
const SWATCHES = ["#B5502D", "#35618F", "#6B4A8A", "#A67C2E", "#4B6B4E", "#8A4B6B", "#2E7D8C", "#8C6B2E", "#5C4B8A", "#3D8C5C"];
const NONE_COLOR = "#8C887C";
const REPEAT_OPTIONS = [
  { value: "none", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
];
const REMINDER_OPTIONS = [
  { value: null, label: "Off" },
  { value: 0, label: "At start" },
  { value: 5, label: "5m before" },
  { value: 15, label: "15m before" },
  { value: 30, label: "30m before" },
];
const SWIPE_THRESHOLD = 70;
const GRID_START = 5 * 60;
const GRID_END = 24 * 60;
const HOUR_H = 72;
const SNAP = 15;

/* ---------- date helpers ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDateKey = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const isSameDay = (a, b) => dateKey(a) === dateKey(b);
const addDays = (d, n) => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; };
const addMonths = (d, n) => { const nd = new Date(d); nd.setMonth(nd.getMonth() + n); return nd; };
const startOfWeek = (d) => { const nd = new Date(d); const day = (nd.getDay() + 6) % 7; nd.setDate(nd.getDate() - day); return nd; };
const mondayIndex = (d) => (d.getDay() + 6) % 7;
const minutesToLabel = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const timeStrToMinutes = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const nowMinutes = (d) => d.getHours() * 60 + d.getMinutes();
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const formatDuration = (m) => { if (m < 60) return `${m}m`; const h = Math.floor(m / 60); const r = m % 60; return r ? `${h}h${r}m` : `${h}h`; };
const formatDateBadge = (s) => parseDateKey(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function dueInfo(t) {
  if (!t.date) return { cls: "", label: "No date" };
  const timePart = t.start != null ? " · " + minutesToLabel(t.start) : "";
  if (t.done) return { cls: "", label: formatDateBadge(t.date) + timePart };
  const todayKey = dateKey(today);
  if (t.date < todayKey) return { cls: "due-overdue", label: "Overdue · " + formatDateBadge(t.date) };
  if (t.date === todayKey) return { cls: "due-today", label: "Today" + timePart };
  return { cls: "", label: formatDateBadge(t.date) + timePart };
}
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const nowIso = () => new Date().toISOString();
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function monthMatrix(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks = [];
  let cur = gridStart;
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) { row.push(cur); cur = addDays(cur, 1); }
    weeks.push(row);
  }
  return weeks;
}

function templateAppliesToDate(tmpl, d) {
  if (tmpl.repeat === "daily") return true;
  if (tmpl.repeat === "weekdays") return d.getDay() >= 1 && d.getDay() <= 5;
  if (tmpl.repeat === "weekly") return mondayIndex(d) === tmpl.weekday;
  return false;
}

/* ---------- local storage ---------- */
function saveLocal() {
  localStorage.setItem("planner_categories", JSON.stringify(state.categories));
  localStorage.setItem("planner_tasks", JSON.stringify(state.tasks));
  localStorage.setItem("planner_darkmode", JSON.stringify(state.darkMode));
  localStorage.setItem("planner_pending_deletes", JSON.stringify(state.pendingDeletes));
  localStorage.setItem("planner_recurring", JSON.stringify(state.recurring));
}
function loadAllLocal() {
  let categories = [], tasks = [], darkMode = false, pendingDeletes = { tasks: [], categories: [] }, recurring = [];
  try { categories = JSON.parse(localStorage.getItem("planner_categories") || "[]"); } catch {}
  try { tasks = JSON.parse(localStorage.getItem("planner_tasks") || "[]"); } catch {}
  try { darkMode = JSON.parse(localStorage.getItem("planner_darkmode") || "false"); } catch {}
  try { pendingDeletes = JSON.parse(localStorage.getItem("planner_pending_deletes") || '{"tasks":[],"categories":[]}'); } catch {}
  try { recurring = JSON.parse(localStorage.getItem("planner_recurring") || "[]"); } catch {}
  return { categories, tasks, darkMode, pendingDeletes, recurring };
}

/* ---------- state ---------- */
const today = new Date();
const state = {
  selectedDate: new Date(),
  monthCursor: new Date(),
  view: "timeline",
  categories: [],
  tasks: [],
  darkMode: false,
  pendingDeletes: { tasks: [], categories: [] },
  sheetOpen: false,
  authOpen: false,
  authMode: "signin",
  authMessage: "",
  importOpen: false,
  importMessage: "",
  searchQuery: "",
  categoryFilter: "all",
  editingCatId: null,
  editingCatName: "",
  manageCatFormOpen: false,
  manageCatColor: SWATCHES[0],
  session: null,
  syncStatus: "idle", // idle | syncing | error
  recurring: [],
  toasts: [],
};

let sheetDraft = null; // set when sheet opens
let timelineDrag = null; // {taskId, mode, startY, originStart, originDuration, el, moved}
let swipeDrag = null; // {taskId, el, wrapEl, startX, startY, dx, dragging}
let suppressNextClick = false;

/* ---------- category / task helpers ---------- */
const catById = (id) => state.categories.find((c) => c.id === id) || { id: null, label: "Uncategorized", color: NONE_COLOR };

/* ---------- recurring tasks ---------- */
function materializeWindow(fromDate, toDate) {
  if (!state.recurring.length) return;
  let changed = false;
  for (let d = new Date(fromDate); d <= toDate; d = addDays(d, 1)) {
    const dk = dateKey(d);
    state.recurring.forEach((tmpl) => {
      if (!templateAppliesToDate(tmpl, d)) return;
      const exists = state.tasks.some((t) => t.recurringId === tmpl.id && t.date === dk);
      if (exists) return;
      state.tasks.push({
        id: genId(), title: tmpl.title, categoryId: tmpl.categoryId, priority: tmpl.priority ?? null,
        date: dk, start: tmpl.start, duration: tmpl.duration, done: false,
        checklist: (tmpl.checklist || []).map((c) => ({ id: genId(), text: c.text, done: false })),
        updatedAt: nowIso(), dirty: true, recurringId: tmpl.id, reminderOffset: tmpl.reminderOffset ?? null,
      });
      changed = true;
    });
  }
  if (changed) { persist(); trySync(); scheduleReminders(); }
}
function materializeVisibleMonth() {
  const weeks = monthMatrix(state.monthCursor);
  const flat = weeks.flat();
  materializeWindow(flat[0], flat[flat.length - 1]);
}
function deleteSeries(templateId, keepThisTaskId) {
  state.recurring = state.recurring.filter((t) => t.id !== templateId);
  persist();
}

/* ---------- reminders / toasts ---------- */
let reminderTimers = [];
let firedReminders = new Set();
try { firedReminders = new Set(JSON.parse(localStorage.getItem("planner_fired_reminders") || "[]")); } catch {}
function saveFired() { localStorage.setItem("planner_fired_reminders", JSON.stringify([...firedReminders])); }

function requestNotifPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
function pushToast(text) {
  const id = genId();
  state.toasts.push({ id, text });
  render();
  setTimeout(() => { state.toasts = state.toasts.filter((t) => t.id !== id); render(); }, 8000);
}
function dismissToast(id) { state.toasts = state.toasts.filter((t) => t.id !== id); render(); }

function scheduleReminders() {
  reminderTimers.forEach((id) => clearTimeout(id));
  reminderTimers = [];
  const todayKey = dateKey(today);
  state.tasks.forEach((t) => {
    if (t.date !== todayKey || t.start == null || t.reminderOffset == null || t.done) return;
    const fireKey = `${todayKey}_${t.id}`;
    if (firedReminders.has(fireKey)) return;
    const fireAtMinutes = t.start - t.reminderOffset;
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const fireTime = new Date(base.getTime() + fireAtMinutes * 60000);
    const ms = fireTime.getTime() - Date.now();
    if (ms <= 0) return;
    const tid = setTimeout(() => {
      firedReminders.add(fireKey); saveFired();
      pushToast(t.reminderOffset === 0 ? `${t.title} starts now` : `${t.title} starts in ${t.reminderOffset}m`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification(t.title, { body: "Time to start" }); } catch {}
      }
    }, ms);
    reminderTimers.push(tid);
  });
}

/* ---------- Supabase ---------- */
let supabase = null;
async function initSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT") || !SUPABASE_URL.startsWith("http")) return null;
  try {
    const mod = await import("https://esm.sh/@supabase/supabase-js@2");
    return mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase failed to load (offline-only mode)", e);
    return null;
  }
}

function taskToRemote(t, uid) {
  return {
    id: t.id, user_id: uid, title: t.title, category_id: t.categoryId, priority: t.priority,
    date: t.date, start_minutes: t.start, duration: t.duration, done: t.done,
    checklist: t.checklist, updated_at: t.updatedAt,
  };
}
function remoteToTask(r) {
  return {
    id: r.id, title: r.title, categoryId: r.category_id, priority: r.priority, date: r.date,
    start: r.start_minutes, duration: r.duration, done: r.done, checklist: r.checklist || [],
    updatedAt: r.updated_at, dirty: false,
  };
}
function catToRemote(c, uid) {
  return { id: c.id, user_id: uid, label: c.label, color: c.color, updated_at: c.updatedAt };
}
function remoteToCat(r) {
  return { id: r.id, label: r.label, color: r.color, updatedAt: r.updated_at, dirty: false };
}

async function processPendingDeletes(uid) {
  const stillPendingCats = [];
  for (const id of state.pendingDeletes.categories) {
    const { error } = await supabase.from("categories").delete().eq("id", id).eq("user_id", uid);
    if (error) stillPendingCats.push(id);
  }
  state.pendingDeletes.categories = stillPendingCats;

  const stillPendingTasks = [];
  for (const id of state.pendingDeletes.tasks) {
    const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", uid);
    if (error) stillPendingTasks.push(id);
  }
  state.pendingDeletes.tasks = stillPendingTasks;
}

async function pushDirty(uid) {
  const dirtyCats = state.categories.filter((c) => c.dirty);
  for (const c of dirtyCats) {
    const { error } = await supabase.from("categories").upsert(catToRemote(c, uid));
    if (!error) c.dirty = false;
  }
  const dirtyTasks = state.tasks.filter((t) => t.dirty);
  for (const t of dirtyTasks) {
    const { error } = await supabase.from("tasks").upsert(taskToRemote(t, uid));
    if (!error) t.dirty = false;
  }
}

async function pullRemote(uid) {
  const [{ data: cats, error: ce }, { data: tasks, error: te }] = await Promise.all([
    supabase.from("categories").select("*").eq("user_id", uid),
    supabase.from("tasks").select("*").eq("user_id", uid),
  ]);
  if (ce || te) { console.warn(ce || te); return; }

  const remoteCatIds = new Set((cats || []).map((r) => r.id));
  (cats || []).forEach((r) => {
    const local = state.categories.find((c) => c.id === r.id);
    const remoteObj = remoteToCat(r);
    if (!local) state.categories.push(remoteObj);
    else if (!local.dirty && new Date(remoteObj.updatedAt) > new Date(local.updatedAt)) Object.assign(local, remoteObj);
  });
  state.categories = state.categories.filter((c) => c.dirty || remoteCatIds.has(c.id));

  const remoteTaskIds = new Set((tasks || []).map((r) => r.id));
  (tasks || []).forEach((r) => {
    const local = state.tasks.find((t) => t.id === r.id);
    const remoteObj = remoteToTask(r);
    if (!local) state.tasks.push(remoteObj);
    else if (!local.dirty && new Date(remoteObj.updatedAt) > new Date(local.updatedAt)) Object.assign(local, remoteObj);
  });
  state.tasks = state.tasks.filter((t) => t.dirty || remoteTaskIds.has(t.id));
}

let syncing = false;
async function trySync() {
  if (!supabase || !state.session || syncing) return;
  syncing = true;
  state.syncStatus = "syncing";
  render();
  const uid = state.session.user.id;
  try {
    await processPendingDeletes(uid);
    await pushDirty(uid);
    await pullRemote(uid);
    state.syncStatus = "idle";
  } catch (e) {
    console.warn("sync error", e);
    state.syncStatus = "error";
  } finally {
    saveLocal();
    syncing = false;
    render();
  }
}

/* ---------- mutations ---------- */
function persist() { saveLocal(); }

function toggleDone(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.updatedAt = nowIso();
  t.dirty = true;
  persist();
  render();
  trySync();
  scheduleReminders();
}

function toggleDark() {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle("dark", state.darkMode);
  persist();
  render();
}

function openAddSheet(opts = {}) {
  sheetDraft = {
    id: null, categoryId: null, priority: null, date: opts.date || "", startStr: opts.startStr || "",
    duration: 60, checklist: [], newCatOpen: false, newCatColor: SWATCHES[0],
    repeat: "none", reminderOffset: null, recurringId: null,
  };
  state.sheetOpen = true;
  render();
  focusTitleInput();
}
function openEditSheet(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  sheetDraft = {
    id: t.id, categoryId: t.categoryId, priority: t.priority || null, date: t.date || "",
    startStr: t.start != null ? minutesToLabel(t.start) : "", duration: t.duration || 60,
    checklist: t.checklist || [], title: t.title, newCatOpen: false, newCatColor: SWATCHES[0],
    repeat: "none", reminderOffset: t.reminderOffset ?? null, recurringId: t.recurringId || null,
  };
  state.sheetOpen = true;
  render();
}
function closeSheet() { state.sheetOpen = false; sheetDraft = null; render(); }
function focusTitleInput() { const el = document.getElementById("f-title"); if (el) el.focus(); }

function saveDraft() {
  const titleEl = document.getElementById("f-title");
  const title = (titleEl ? titleEl.value : sheetDraft.title || "").trim();
  if (!title) { if (titleEl) titleEl.focus(); return; }
  const dateVal = sheetDraft.date || null;
  const startVal = dateVal && sheetDraft.startStr ? timeStrToMinutes(sheetDraft.startStr) : null;
  const durationVal = startVal != null ? sheetDraft.duration : null;
  const reminderVal = startVal != null ? sheetDraft.reminderOffset : null;

  if (sheetDraft.id) {
    const t = state.tasks.find((x) => x.id === sheetDraft.id);
    if (t) {
      t.title = title; t.categoryId = sheetDraft.categoryId; t.priority = sheetDraft.priority;
      t.date = dateVal; t.start = startVal; t.duration = durationVal; t.checklist = sheetDraft.checklist;
      t.reminderOffset = reminderVal;
      t.updatedAt = nowIso(); t.dirty = true;
    }
  } else {
    let recurringId = null;
    if (sheetDraft.repeat !== "none" && dateVal && startVal != null) {
      recurringId = genId();
      state.recurring.push({
        id: recurringId, title, categoryId: sheetDraft.categoryId, priority: sheetDraft.priority,
        start: startVal, duration: durationVal, checklist: sheetDraft.checklist.map((c) => ({ text: c.text })),
        repeat: sheetDraft.repeat, weekday: mondayIndex(parseDateKey(dateVal)), reminderOffset: reminderVal,
      });
    }
    state.tasks.push({
      id: genId(), title, categoryId: sheetDraft.categoryId, priority: sheetDraft.priority,
      date: dateVal, start: startVal, duration: durationVal, done: false,
      checklist: sheetDraft.checklist, updatedAt: nowIso(), dirty: true,
      recurringId, reminderOffset: reminderVal,
    });
  }
  persist();
  closeSheet();
  trySync();
  scheduleReminders();
}

function quickAddTask() {
  const input = document.getElementById("quick-add-input");
  const title = input ? input.value.trim() : "";
  if (!title) return;
  state.tasks.push({
    id: genId(), title, categoryId: null, priority: null,
    date: null, start: null, duration: null, done: false,
    checklist: [], updatedAt: nowIso(), dirty: true,
  });
  persist();
  render();
  trySync();
  const again = document.getElementById("quick-add-input");
  if (again) again.focus();
}

function deleteDraft() {
  if (!sheetDraft || !sheetDraft.id) return;
  state.tasks = state.tasks.filter((t) => t.id !== sheetDraft.id);
  state.pendingDeletes.tasks.push(sheetDraft.id);
  persist();
  closeSheet();
  trySync();
  scheduleReminders();
}
function deleteDraftSeries() {
  if (!sheetDraft || !sheetDraft.recurringId) return;
  deleteSeries(sheetDraft.recurringId);
  deleteDraft();
}

function addChecklistItem() {
  const input = document.getElementById("f-checklist-add");
  if (!input || !input.value.trim()) return;
  sheetDraft.checklist.push({ id: genId(), text: input.value.trim(), done: false });
  input.value = "";
  render();
  const again = document.getElementById("f-checklist-add");
  if (again) again.focus();
}
function removeChecklistItem(id) {
  sheetDraft.checklist = sheetDraft.checklist.filter((c) => c.id !== id);
  render();
}

function submitNewCategorySheet() {
  const input = document.getElementById("sheet-new-cat-name");
  const name = input ? input.value.trim() : "";
  if (!name) return;
  const cat = { id: genId(), label: name, color: sheetDraft.newCatColor, updatedAt: nowIso(), dirty: true };
  state.categories.push(cat);
  sheetDraft.categoryId = cat.id;
  sheetDraft.newCatOpen = false;
  persist();
  render();
  trySync();
}
function submitNewCategoryManage() {
  const input = document.getElementById("manage-new-cat-name");
  const name = input ? input.value.trim() : "";
  if (!name) return;
  const cat = { id: genId(), label: name, color: state.manageCatColor, updatedAt: nowIso(), dirty: true };
  state.categories.push(cat);
  state.manageCatFormOpen = false;
  persist();
  render();
  trySync();
}
function commitRenameCategory() {
  const input = document.getElementById("manage-rename-input");
  const name = input ? input.value.trim() : "";
  const cat = state.categories.find((c) => c.id === state.editingCatId);
  if (cat && name) { cat.label = name; cat.updatedAt = nowIso(); cat.dirty = true; }
  state.editingCatId = null;
  persist();
  render();
  trySync();
}
function deleteCategoryAction(id) {
  state.categories = state.categories.filter((c) => c.id !== id);
  state.pendingDeletes.categories.push(id);
  state.tasks.forEach((t) => { if (t.categoryId === id) { t.categoryId = null; t.updatedAt = nowIso(); t.dirty = true; } });
  if (state.categoryFilter === id) state.categoryFilter = "all";
  persist();
  render();
  trySync();
}

/* ---------- plan import ---------- */
function findOrCreateCategory(name) {
  if (!name) return null;
  const existing = state.categories.find((c) => c.label.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const color = SWATCHES[state.categories.length % SWATCHES.length];
  const cat = { id: genId(), label: name, color, updatedAt: nowIso(), dirty: true };
  state.categories.push(cat);
  return cat.id;
}

function importPlan(plan, startDate) {
  if (!plan || !Array.isArray(plan.days)) { state.importMessage = "That file doesn't look like a valid plan."; renderImportOnly(); return; }
  let count = 0;
  plan.days.forEach((day) => {
    const date = dateKey(addDays(startDate, day.offset));
    (day.tasks || []).forEach((t) => {
      state.tasks.push({
        id: genId(), title: t.title, categoryId: findOrCreateCategory(t.category),
        priority: t.priority || null, date, start: t.start ?? null, duration: t.start != null ? (t.duration || 30) : null,
        done: false, checklist: (t.checklist || []).map((text) => ({ id: genId(), text, done: false })),
        updatedAt: nowIso(), dirty: true, recurringId: null, reminderOffset: null,
      });
      count++;
    });
  });
  persist();
  trySync();
  state.importOpen = false;
  state.importMessage = "";
  render();
  pushToast(`Imported ${count} tasks from "${plan.name || "plan"}"`);
}

function doImport() {
  const fileInput = document.getElementById("import-file");
  const dateInput = document.getElementById("import-start-date");
  const file = fileInput && fileInput.files[0];
  const startDateStr = dateInput ? dateInput.value : "";
  if (!file) { state.importMessage = "Choose a .json plan file first."; renderImportOnly(); return; }
  if (!startDateStr) { state.importMessage = "Pick a start date."; renderImportOnly(); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const plan = JSON.parse(reader.result);
      importPlan(plan, parseDateKey(startDateStr));
    } catch (e) {
      state.importMessage = "Couldn't read that file as JSON.";
      renderImportOnly();
    }
  };
  reader.readAsText(file);
}
function renderImportOnly() {
  const el = document.getElementById("import-modal-body");
  if (el) el.innerHTML = importModalBodyHTML();
}

/* ---------- auth ---------- */
async function doSignIn() {
  const email = document.getElementById("auth-email").value.trim();
  const pw = document.getElementById("auth-pw").value;
  if (!supabase) { state.authMessage = "Sync isn't configured yet — see README.md."; renderAuthOnly(); return; }
  state.authMessage = "Signing in…"; renderAuthOnly();
  const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
  state.authMessage = error ? error.message : "";
  if (!error) { state.authOpen = false; }
  render();
}
async function doSignUp() {
  const email = document.getElementById("auth-email").value.trim();
  const pw = document.getElementById("auth-pw").value;
  if (!supabase) { state.authMessage = "Sync isn't configured yet — see README.md."; renderAuthOnly(); return; }
  state.authMessage = "Creating account…"; renderAuthOnly();
  const { error } = await supabase.auth.signUp({ email, password: pw });
  state.authMessage = error ? error.message : "Check your email to confirm, then sign in.";
  render();
}
async function doSignOut() {
  if (supabase) await supabase.auth.signOut();
  state.session = null;
  render();
}
function renderAuthOnly() {
  const el = document.getElementById("auth-modal-body");
  if (el) el.innerHTML = authModalBodyHTML();
}

/* ---------- render: pieces ---------- */
function sidebarHTML() {
  const weeks = monthMatrix(state.monthCursor);
  const catRows = state.categories.length
    ? state.categories.map((c) => `<div class="legend-item"><span class="chip-dot" style="background:${c.color}"></span>${escapeHtml(c.label)}</div>`).join("")
    : `<span style="font-size:12px;color:var(--ink-soft)">No categories yet</span>`;

  const authBox = state.session
    ? `<div class="auth-box"><div class="who">Signed in as<br>${escapeHtml(state.session.user.email)}</div><button class="auth-btn" data-action="sign-out">Sign out</button>
       <div class="sync-note">${state.syncStatus === "syncing" ? "Syncing…" : state.syncStatus === "error" ? "Sync error — will retry" : "Synced"}</div></div>`
    : `<div class="auth-box"><div class="who">Not signed in — data stays on this device only.</div><button class="auth-btn" data-action="open-auth">Sign in to sync</button></div>`;

  return `
    <div class="mini-cal">
      <div class="mini-cal-head">
        <button class="nav-btn" data-action="cal-prev-month" aria-label="Previous month">‹</button>
        <span class="mini-cal-title">${state.monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button class="nav-btn" data-action="cal-next-month" aria-label="Next month">›</button>
      </div>
      <div class="mini-cal-grid">
        ${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<div class="mini-cal-dow">${d}</div>`).join("")}
        ${weeks.flat().map((d) => {
          const cls = ["mini-cal-day"];
          if (d.getMonth() !== state.monthCursor.getMonth()) cls.push("outside");
          if (isSameDay(d, state.selectedDate)) cls.push("selected");
          if (isSameDay(d, today)) cls.push("today");
          return `<button class="${cls.join(" ")}" data-action="select-date" data-date="${dateKey(d)}">${d.getDate()}</button>`;
        }).join("")}
      </div>
    </div>
    <div class="legend">${catRows}</div>
    <button class="mini-btn ghost" style="width:100%;justify-content:center" data-action="open-import">📥 Import a plan</button>
    ${authBox}
  `;
}

function tabBarHTML() {
  const tab = (v, icon, label) => `<button class="tab-btn ${state.view === v ? "active" : ""}" data-action="set-view" data-view="${v}">${icon} ${label}</button>`;
  return `
    <div class="tab-bar">
      ${tab("timeline", "🕐", "Timeline")}
      ${tab("calendar", "📅", "Calendar")}
      ${tab("tasks", "☑︎", "Tasks")}
      ${tab("stats", "📊", "Stats")}
      <div class="tab-spacer"></div>
      <button class="icon-btn" data-action="toggle-dark" aria-label="Toggle dark mode">${state.darkMode ? "☀️" : "🌙"}</button>
    </div>
  `;
}

function timelineHTML() {
  const selDk = dateKey(state.selectedDate);
  const timelineTasks = state.tasks.filter((t) => t.date === selDk && t.start != null);
  const allDayTasks = state.tasks.filter((t) => t.date === selDk && t.start == null);
  const completed = timelineTasks.filter((t) => t.done).length + allDayTasks.filter((t) => t.done).length;
  const total = timelineTasks.length + allDayTasks.length;
  const isToday = isSameDay(state.selectedDate, today);
  const week = []; const wkStart = startOfWeek(state.selectedDate);
  for (let i = 0; i < 7; i++) week.push(addDays(wkStart, i));
  const headerLabel = state.selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const hours = [];
  for (let m = GRID_START; m <= GRID_END; m += 60) hours.push(m);
  const gridHeight = ((GRID_END - GRID_START) / 60) * HOUR_H;
  const nowTop = ((nowMinutes(new Date()) - GRID_START) / 60) * HOUR_H;

  const hourRows = hours.map((m) => `<div class="hour-row" style="top:${((m - GRID_START) / 60) * HOUR_H}px"><span class="hour-label">${minutesToLabel(m)}</span></div>`).join("");
  const nowLine = isToday && nowMinutes(new Date()) >= GRID_START && nowMinutes(new Date()) <= GRID_END
    ? `<div class="now-line" style="top:${nowTop}px"><span class="now-dot"></span></div>` : "";

  const blocks = timelineTasks.map((t) => {
    const cat = catById(t.categoryId);
    const top = ((t.start - GRID_START) / 60) * HOUR_H;
    const height = Math.max((t.duration / 60) * HOUR_H, 30);
    const doneItems = t.checklist.filter((c) => c.done).length;
    return `
      <div class="block ${t.done ? "done" : ""}" style="top:${top}px;height:${height}px;--cat-color:${cat.color}" data-action="open-edit-sheet" data-id="${t.id}" data-drag-id="${t.id}">
        <div class="block-top">
          <div class="check-circle ${t.done ? "checked" : ""}" style="--cat-color:${cat.color}" data-action="toggle-done" data-id="${t.id}">${t.done ? "✓" : ""}</div>
          <span class="block-title">${escapeHtml(t.title)}</span>
          ${t.reminderOffset != null ? `<span style="font-size:10px">🔔</span>` : ""}
        </div>
        <div class="block-time">${minutesToLabel(t.start)}–${minutesToLabel(t.start + t.duration)}${t.checklist.length ? ` · ${doneItems}/${t.checklist.length}` : ""}</div>
        <div class="resize-handle" data-resize-id="${t.id}"></div>
      </div>`;
  }).join("");

  const allDayRow = allDayTasks.length
    ? `<div class="all-day-row">${allDayTasks.map((t) => {
        const cat = catById(t.categoryId);
        return `<div class="all-day-chip ${t.done ? "done" : ""}" data-action="open-edit-sheet" data-id="${t.id}"><span class="chip-dot" style="background:${cat.color}"></span>${escapeHtml(t.title)}</div>`;
      }).join("")}</div>`
    : "";

  return `
    <div class="head">
      <div class="head-row">
        <button class="nav-btn" data-action="nav-prev-day" aria-label="Previous day">‹</button>
        <div><span class="date-title">${headerLabel}</span>${!isToday ? `<button class="today-pill" data-action="nav-today">today</button>` : ""}</div>
        <button class="nav-btn" data-action="nav-next-day" aria-label="Next day">›</button>
      </div>
      <div class="week-strip">
        ${week.map((d) => {
          const cls = ["week-day"];
          if (isSameDay(d, state.selectedDate)) cls.push("selected");
          if (isSameDay(d, today)) cls.push("today");
          return `<button class="${cls.join(" ")}" data-action="select-date" data-date="${dateKey(d)}"><span class="dow">${d.toLocaleDateString(undefined, { weekday: "narrow" })}</span><span class="num">${d.getDate()}</span></button>`;
        }).join("")}
      </div>
      ${total > 0 ? `<div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${(completed / total) * 100}%"></div></div><span class="progress-label">${completed}/${total} done</span></div>` : ""}
    </div>
    ${allDayRow}
    <div class="scroll-area" id="scroll-area">
      <div class="grid" id="grid" style="height:${gridHeight}px">
        ${hourRows}
        ${nowLine}
        ${blocks}
        ${timelineTasks.length === 0 && allDayTasks.length === 0 ? `<div class="empty-hint">Tap anywhere on the timeline to plan something.</div>` : ""}
      </div>
    </div>
    <button class="fab" data-action="open-add-sheet" data-date="${selDk}" aria-label="Add task">+</button>
  `;
}

function calendarViewHTML() {
  const weeks = monthMatrix(state.monthCursor);
  const todayKey = dateKey(today);
  const cells = weeks.flat().map((d) => {
    const dk = dateKey(d);
    const dayTasks = state.tasks.filter((t) => t.date === dk).sort((a, b) => (a.start ?? -1) - (b.start ?? -1));
    const hasOverdueUndone = d < today && !isSameDay(d, today) && dayTasks.some((t) => !t.done);
    const cls = ["cal-cell"];
    if (d.getMonth() !== state.monthCursor.getMonth()) cls.push("outside");
    if (isSameDay(d, state.selectedDate)) cls.push("selected");
    if (isSameDay(d, today)) cls.push("today");
    const shown = dayTasks.slice(0, 3);
    const extra = dayTasks.length - shown.length;
    const bars = shown.map((t) => {
      const cat = catById(t.categoryId);
      return `<div class="cal-event-bar ${t.done ? "done" : ""}" style="--cat-color:${cat.color}" data-action="open-edit-sheet" data-id="${t.id}" draggable="true" data-drag-task-id="${t.id}">${t.start != null ? minutesToLabel(t.start) + " " : ""}${escapeHtml(t.title)}</div>`;
    }).join("");
    const more = extra > 0 ? `<div class="cal-more">+${extra} more</div>` : "";
    return `
      <div class="${cls.join(" ")}" data-action="select-date" data-date="${dk}" data-drop-date="${dk}">
        <span class="cal-cell-num ${hasOverdueUndone ? "due-overdue" : ""}">${d.getDate()}</span>
        <div class="cal-cell-events">${bars}${more}</div>
      </div>`;
  }).join("");

  return `
    <div class="head">
      <div class="head-row">
        <button class="nav-btn" data-action="cal-prev-month" aria-label="Previous month">‹</button>
        <div><span class="date-title">${state.monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span><button class="today-pill" data-action="cal-jump-today">today</button></div>
        <button class="nav-btn" data-action="cal-next-month" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="view-body cal-view-body">
      <div class="cal-dow-row">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
    </div>
    <button class="fab" data-action="open-add-sheet" data-date="${dateKey(state.selectedDate)}" aria-label="Add task">+</button>
  `;
}

function railHTML() {
  const todayKey = dateKey(today);
  const upcoming = state.tasks
    .filter((t) => !t.done && t.date && t.date >= todayKey)
    .sort((a, b) => (a.date === b.date ? (a.start ?? 9999) - (b.start ?? 9999) : a.date < b.date ? -1 : 1))
    .slice(0, 8);
  const backlog = state.tasks.filter((t) => !t.done && !t.date).slice(0, 5);

  const rows = (list) => list.map((t) => {
    const cat = catById(t.categoryId);
    const due = dueInfo(t);
    return `
      <div class="upcoming-row" data-action="open-edit-sheet" data-id="${t.id}">
        <div class="check-circle" style="--cat-color:${cat.color}" data-action="toggle-done" data-id="${t.id}">${t.done ? "✓" : ""}</div>
        <span class="chip-dot" style="background:${cat.color}"></span>
        <span class="task-row-title">${escapeHtml(t.title)}</span>
        <span class="task-row-meta ${due.cls}">${due.label}</span>
      </div>`;
  }).join("");

  return `
    <div class="rail-card">
      <div class="field-label">quick add</div>
      <div class="add-item-row">
        <input id="quick-add-input" class="text-input" placeholder="Add a task…" />
        <button class="mini-btn" data-action="quick-add-task">+</button>
      </div>
    </div>
    <div class="rail-card">
      <div class="field-label">upcoming</div>
      ${upcoming.length ? rows(upcoming) : `<div class="empty-hint-static" style="padding:10px 0">Nothing scheduled.</div>`}
    </div>
    ${backlog.length ? `<div class="rail-card"><div class="field-label">backlog</div>${rows(backlog)}</div>` : ""}
  `;
}

function tasksViewHTML() {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const filtered = state.tasks
    .filter((t) => state.categoryFilter === "all" || t.categoryId === state.categoryFilter)
    .filter((t) => !state.searchQuery.trim() || t.title.toLowerCase().includes(state.searchQuery.trim().toLowerCase()))
    .slice()
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pr = (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
      if (pr !== 0) return pr;
      const ad = a.date || "9999-99-99", bd = b.date || "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.start ?? 9999) - (b.start ?? 9999);
    });

  const rows = filtered.length
    ? filtered.map((t) => {
        const cat = catById(t.categoryId);
        const pr = PRIORITIES.find((p) => p.value === (t.priority || null));
        const due = dueInfo(t);
        return `
          <div class="task-row-wrap" data-swipe-id="${t.id}">
            <div class="swipe-bg swipe-bg-complete">✓ Done</div>
            <div class="swipe-bg swipe-bg-delete">Delete 🗑</div>
            <div class="task-row ${t.done ? "done" : ""}" data-action="open-edit-sheet" data-id="${t.id}">
              <div class="check-circle" style="--cat-color:${cat.color}" data-action="toggle-done" data-id="${t.id}">${t.done ? "✓" : ""}</div>
              <span class="chip-dot" style="background:${cat.color}"></span>
              <span class="task-row-title">${escapeHtml(t.title)}</span>
              ${pr.value ? `<span style="font-size:11px;color:${pr.color}">⚑</span>` : ""}
              <span class="task-row-meta ${due.cls}">${due.label}</span>
            </div>
          </div>`;
      }).join("")
    : `<div class="empty-hint-static">No tasks match — add one with the + button.</div>`;

  const filterChips = `
    <button class="filter-chip ${state.categoryFilter === "all" ? "active" : ""}" data-action="filter-cat" data-id="all">All</button>
    ${state.categories.map((c) => `<button class="filter-chip ${state.categoryFilter === c.id ? "active" : ""}" style="--chip-color:${c.color}" data-action="filter-cat" data-id="${c.id}"><span class="chip-dot" style="background:${c.color}"></span>${escapeHtml(c.label)}</button>`).join("")}
  `;

  const manageCatRows = state.categories.map((c) => `
    <div class="manage-cat-row">
      <span class="chip-dot" style="background:${c.color}"></span>
      ${state.editingCatId === c.id
        ? `<input id="manage-rename-input" class="text-input inline-edit" value="${escapeHtml(c.label)}" />`
        : `<span class="manage-cat-label" data-action="manage-rename-start" data-id="${c.id}">${escapeHtml(c.label)}</span>`}
      ${state.editingCatId === c.id
        ? `<button class="icon-btn" data-action="manage-rename-commit">✓</button>`
        : `<button class="icon-btn" data-action="manage-delete-cat" data-id="${c.id}" aria-label="Delete category">✕</button>`}
    </div>`).join("");

  const manageCatForm = state.manageCatFormOpen
    ? `<div class="new-cat-form">
        <input id="manage-new-cat-name" class="text-input" placeholder="Category name" />
        <div class="swatch-row">${SWATCHES.map((sw) => `<button class="swatch ${state.manageCatColor === sw ? "active" : ""}" style="background:${sw}" data-action="manage-set-swatch" data-color="${sw}"></button>`).join("")}</div>
        <button class="mini-btn" data-action="manage-submit-cat">Add category</button>
      </div>`
    : `<button class="mini-btn ghost" data-action="manage-open-cat-form">+ Add category</button>`;

  return `
    <div class="view-body">
      <div class="search-row">🔎<input id="search-input" placeholder="Search tasks" /></div>
      <div class="filter-row">${filterChips}</div>
      <div class="task-list" id="task-list">${rows}</div>
      <div class="manage-cats">
        <div class="field-label">categories</div>
        <div class="manage-cat-list">${manageCatRows}</div>
        ${manageCatForm}
      </div>
      <button class="mini-btn ghost" style="width:100%;justify-content:center;margin-top:14px" data-action="open-import">📥 Import a plan</button>
    </div>
    <button class="fab" data-action="open-add-sheet" aria-label="Add task">+</button>
  `;
}

function statsViewHTML() {
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const last7Keys = new Set(last7.map((d) => dateKey(d)));
  const perDay = last7.map((d) => {
    const dk = dateKey(d);
    const dayTasks = state.tasks.filter((t) => t.date === dk);
    return { date: d, total: dayTasks.length, done: dayTasks.filter((t) => t.done).length };
  });
  const weeklyTotal = perDay.reduce((s, p) => s + p.total, 0);
  const weeklyDone = perDay.reduce((s, p) => s + p.done, 0);
  const weeklyRate = weeklyTotal ? Math.round((weeklyDone / weeklyTotal) * 100) : 0;

  const catTime = {};
  state.tasks.forEach((t) => {
    if (t.done && t.start != null && t.date && last7Keys.has(t.date)) {
      const k = t.categoryId || "none";
      catTime[k] = (catTime[k] || 0) + (t.duration || 0);
    }
  });
  const catTimeList = Object.entries(catTime).map(([id, mins]) => ({ cat: catById(id === "none" ? null : id), mins })).sort((a, b) => b.mins - a.mins);
  const maxMins = Math.max(1, ...catTimeList.map((c) => c.mins));

  let streak = 0; let cursor = new Date(today);
  while (true) {
    const dk = dateKey(cursor);
    const doneCount = state.tasks.filter((t) => t.date === dk && t.done).length;
    if (doneCount > 0) { streak++; cursor = addDays(cursor, -1); } else break;
  }
  const totalAll = state.tasks.length;
  const completedAll = state.tasks.filter((t) => t.done).length;
  const backlogCount = state.tasks.filter((t) => t.date == null && !t.done).length;

  return `
    <div class="view-body">
      <div class="stat-cards">
        <div class="stat-card"><span class="stat-num">${weeklyRate}%</span><span class="stat-label">done this week</span></div>
        <div class="stat-card"><span class="stat-num">${streak}</span><span class="stat-label">day streak</span></div>
        <div class="stat-card"><span class="stat-num">${backlogCount}</span><span class="stat-label">open backlog</span></div>
      </div>
      <div class="field-label">last 7 days</div>
      <div class="day-bars">
        ${perDay.map((p) => `<div class="day-bar-col"><div class="day-bar-track"><div class="day-bar-fill" style="height:${p.total ? (p.done / p.total) * 100 : 0}%"></div></div><span class="day-bar-label">${p.date.toLocaleDateString(undefined, { weekday: "narrow" })}</span></div>`).join("")}
      </div>
      <div class="field-label">time by category (7 days)</div>
      ${catTimeList.length === 0 ? `<div class="empty-hint-static">Nothing logged yet.</div>` : catTimeList.map((c) => `
        <div class="cat-time-row">
          <span class="chip-dot" style="background:${c.cat.color}"></span>
          <span class="cat-time-label">${escapeHtml(c.cat.label)}</span>
          <div class="cat-time-track"><div class="cat-time-fill" style="width:${(c.mins / maxMins) * 100}%;background:${c.cat.color}"></div></div>
          <span class="cat-time-mins">${formatDuration(c.mins)}</span>
        </div>`).join("")}
      <div class="field-label">all time</div>
      <div class="stat-cards">
        <div class="stat-card"><span class="stat-num">${totalAll}</span><span class="stat-label">total tasks</span></div>
        <div class="stat-card"><span class="stat-num">${completedAll}</span><span class="stat-label">completed</span></div>
      </div>
    </div>
  `;
}

function sheetHTML() {
  if (!state.sheetOpen || !sheetDraft) return "";
  const d = sheetDraft;
  const catChips = `
    <button class="cat-chip ${d.categoryId == null ? "active" : ""}" style="--chip-color:${NONE_COLOR}" data-action="set-cat" data-id="null"><span class="chip-dot" style="background:${NONE_COLOR}"></span>None</button>
    ${state.categories.map((c) => `<button class="cat-chip ${d.categoryId === c.id ? "active" : ""}" style="--chip-color:${c.color}" data-action="set-cat" data-id="${c.id}"><span class="chip-dot" style="background:${c.color}"></span>${escapeHtml(c.label)}</button>`).join("")}
    <button class="cat-chip" data-action="toggle-sheet-new-cat">+ New</button>
  `;
  const newCatForm = d.newCatOpen ? `
    <div class="new-cat-form">
      <input id="sheet-new-cat-name" class="text-input" placeholder="Category name" />
      <div class="swatch-row">${SWATCHES.map((sw) => `<button class="swatch ${d.newCatColor === sw ? "active" : ""}" style="background:${sw}" data-action="sheet-set-swatch" data-color="${sw}"></button>`).join("")}</div>
      <button class="mini-btn" data-action="sheet-submit-cat">Add category</button>
    </div>` : "";

  const priChips = PRIORITIES.map((p) => `<button class="pri-chip ${d.priority === p.value ? "active" : ""}" data-action="set-pri" data-value="${p.value}">${p.label}</button>`).join("");
  const durChips = DURATIONS.map((m) => `<button class="dur-chip ${d.duration === m ? "active" : ""}" data-action="set-dur" data-value="${m}">${formatDuration(m)}</button>`).join("");
  const repChips = REPEAT_OPTIONS.map((r) => `<button class="rep-chip ${d.repeat === r.value ? "active" : ""}" data-action="set-repeat" data-value="${r.value}">${r.label}</button>`).join("");
  const remChips = REMINDER_OPTIONS.map((r) => `<button class="rem-chip ${d.reminderOffset === r.value ? "active" : ""}" data-action="set-reminder" data-value="${r.value}">${r.label}</button>`).join("");

  const checklistRows = d.checklist.map((c) => `
    <div class="checklist-row"><span class="checklist-text">${escapeHtml(c.text)}</span><button class="icon-btn" data-action="remove-checklist-item" data-id="${c.id}">✕</button></div>`).join("");

  return `
    <div class="sheet-overlay" data-action="close-sheet-bg">
      <div class="sheet" id="sheet-inner">
        <div class="sheet-head"><span class="sheet-title">${d.id ? "Edit task" : "New task"}</span><button class="icon-btn" data-action="close-sheet">✕</button></div>
        <div class="field-label">title</div>
        <input id="f-title" class="text-input" placeholder="What needs doing?" value="${escapeHtml(d.title || "")}" />
        <div class="field-label">category</div>
        <div class="cat-row">${catChips}</div>
        ${newCatForm}
        <div class="field-label">priority</div>
        <div class="pri-row">${priChips}</div>
        <div class="field-label">date (optional)</div>
        <input id="f-date" type="date" class="text-input" value="${d.date}" />
        ${d.date ? `<div class="field-label">time (optional — leave blank for all-day)</div><input id="f-start" type="time" class="text-input" value="${d.startStr}" />` : ""}
        ${d.date && d.startStr ? `<div class="field-label">duration</div><div class="dur-row">${durChips}</div>` : ""}
        ${!d.id && d.date && d.startStr ? `<div class="field-label">repeat</div><div class="rep-row">${repChips}</div>` : ""}
        ${d.date && d.startStr ? `<div class="field-label">remind me</div><div class="rem-row">${remChips}</div>` : ""}
        <div class="field-label">checklist</div>
        ${checklistRows}
        <div class="add-item-row"><input id="f-checklist-add" class="text-input" placeholder="Add a checklist item" /><button class="mini-btn" data-action="add-checklist-item">+</button></div>
        ${d.recurringId ? `<div class="series-note"><span>Part of a repeating series</span><button data-action="end-series">End series</button></div>` : ""}
        <div class="sheet-actions">
          ${d.id ? `<button class="del-btn" data-action="delete-task" aria-label="Delete task">🗑</button>` : ""}
          <button class="save-btn" data-action="save-task">Save task</button>
        </div>
      </div>
    </div>
  `;
}

function authModalBodyHTML() {
  const modeLabel = state.authMode === "signin" ? "Sign in" : "Create account";
  const switchLabel = state.authMode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in";
  return `
    <div class="field-label">email</div>
    <input id="auth-email" class="text-input" type="email" placeholder="you@example.com" />
    <div class="field-label">password</div>
    <input id="auth-pw" class="text-input" type="password" placeholder="••••••••" />
    ${state.authMessage ? `<div style="font-size:12px;color:var(--accent);margin-top:10px">${escapeHtml(state.authMessage)}</div>` : ""}
    <div class="sheet-actions">
      <button class="save-btn" data-action="${state.authMode === "signin" ? "do-sign-in" : "do-sign-up"}">${modeLabel}</button>
    </div>
    <button class="mini-btn ghost" style="width:100%;justify-content:center;margin-top:10px" data-action="auth-toggle-mode">${switchLabel}</button>
  `;
}
function importModalBodyHTML() {
  const tomorrowStr = dateKey(addDays(today, 1));
  return `
    <div class="field-label">plan file (.json)</div>
    <input id="import-file" class="text-input" type="file" accept="application/json,.json" />
    <div class="field-label">start date (this becomes "Day 1")</div>
    <input id="import-start-date" class="text-input" type="date" value="${tomorrowStr}" />
    ${state.importMessage ? `<div style="font-size:12px;color:var(--now);margin-top:10px">${escapeHtml(state.importMessage)}</div>` : ""}
    <div class="sheet-actions"><button class="save-btn" data-action="do-import">Import plan</button></div>
    <div style="font-size:11px;color:var(--ink-soft);margin-top:10px">Categories mentioned in the plan are created automatically if they don't already exist. Safe to re-import with a different start date — it just adds tasks, nothing gets overwritten.</div>
  `;
}
function importModalHTML() {
  if (!state.importOpen) return "";
  return `
    <div class="sheet-overlay" data-action="close-import-bg">
      <div class="sheet">
        <div class="sheet-head"><span class="sheet-title">Import a plan</span><button class="icon-btn" data-action="close-import">✕</button></div>
        <div id="import-modal-body">${importModalBodyHTML()}</div>
      </div>
    </div>
  `;
}
function authModalHTML() {
  if (!state.authOpen) return "";
  return `
    <div class="sheet-overlay" data-action="close-auth-bg">
      <div class="sheet">
        <div class="sheet-head"><span class="sheet-title">Sync across devices</span><button class="icon-btn" data-action="close-auth">✕</button></div>
        <div id="auth-modal-body">${authModalBodyHTML()}</div>
      </div>
    </div>
  `;
}

/* ---------- render: root ---------- */
function buildAppHTML() {
  const viewContent =
    state.view === "timeline" ? timelineHTML() :
    state.view === "calendar" ? calendarViewHTML() :
    state.view === "tasks" ? tasksViewHTML() : statsViewHTML();
  const toastStack = state.toasts.length
    ? `<div class="toast-stack">${state.toasts.map((t) => `<div class="toast"><span>${escapeHtml(t.text)}</span><button data-action="dismiss-toast" data-id="${t.id}">✕</button></div>`).join("")}</div>`
    : "";
  return `
    <div class="app-shell">
      <aside class="sidebar">${sidebarHTML()}</aside>
      <div class="phone">
        ${toastStack}
        ${tabBarHTML()}
        ${viewContent}
        ${sheetHTML()}
      </div>
      <aside class="rail">${railHTML()}</aside>
    </div>
    ${authModalHTML()}
    ${importModalHTML()}
  `;
}

function render() {
  document.body.classList.toggle("dark", state.darkMode);
  const app = document.getElementById("app");
  app.innerHTML = buildAppHTML();
  attachPostRenderListeners();
}

function attachPostRenderListeners() {
  const grid = document.getElementById("grid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      if (e.target.closest(".block")) return;
      const rect = grid.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let mins = GRID_START + (y / HOUR_H) * 60;
      mins = Math.round(mins / SNAP) * SNAP;
      mins = clamp(mins, GRID_START, GRID_END - SNAP);
      openAddSheet({ date: dateKey(state.selectedDate), startStr: minutesToLabel(mins) });
    });
  }
  const scrollArea = document.getElementById("scroll-area");
  if (scrollArea && state.view === "timeline") {
    const anchor = isSameDay(state.selectedDate, today) ? nowMinutes(new Date()) : 8 * 60;
    scrollArea.scrollTop = Math.max(0, ((anchor - GRID_START) / 60) * HOUR_H - 120);
  }
  const search = document.getElementById("search-input");
  if (search) {
    search.value = state.searchQuery;
    search.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      const list = document.getElementById("task-list");
      if (list) {
        const temp = document.createElement("div");
        temp.innerHTML = tasksViewHTML();
        const newList = temp.querySelector("#task-list");
        if (newList) list.innerHTML = newList.innerHTML;
      }
    });
  }
  const checklistAdd = document.getElementById("f-checklist-add");
  if (checklistAdd) checklistAdd.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } });
  const quickAdd = document.getElementById("quick-add-input");
  if (quickAdd) quickAdd.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); quickAddTask(); } });
  const renameInput = document.getElementById("manage-rename-input");
  if (renameInput) renameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") commitRenameCategory(); });

  // keep sheet field values in sheetDraft on change (not every keystroke)
  const dateInput = document.getElementById("f-date");
  if (dateInput) dateInput.addEventListener("change", (e) => { sheetDraft.date = e.target.value; if (!e.target.value) sheetDraft.startStr = ""; render(); });
  const startInput = document.getElementById("f-start");
  if (startInput) startInput.addEventListener("change", (e) => { sheetDraft.startStr = e.target.value; render(); });

  // drag-to-reschedule on timeline blocks
  document.querySelectorAll(".block[data-drag-id]").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".check-circle") || e.target.closest(".resize-handle")) return;
      beginTimelineDrag(e, el, el.dataset.dragId, "move");
    });
  });
  document.querySelectorAll(".resize-handle[data-resize-id]").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const block = el.closest(".block");
      beginTimelineDrag(e, block, el.dataset.resizeId, "resize");
    });
  });

  // swipe gestures on task rows
  document.querySelectorAll(".task-row-wrap[data-swipe-id]").forEach((wrap) => {
    const row = wrap.querySelector(".task-row");
    row.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".check-circle")) return;
      swipeDrag = { taskId: wrap.dataset.swipeId, el: row, wrapEl: wrap, startX: e.clientX, startY: e.clientY, dx: 0, dragging: false };
    });
  });

  // drag an event to a different day in Calendar view
  document.querySelectorAll(".cal-event-bar[data-drag-task-id]").forEach((bar) => {
    bar.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", bar.dataset.dragTaskId);
      e.dataTransfer.effectAllowed = "move";
    });
  });
  document.querySelectorAll(".cal-cell[data-drop-date]").forEach((cell) => {
    cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("drop-target"); });
    cell.addEventListener("dragleave", () => cell.classList.remove("drop-target"));
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      cell.classList.remove("drop-target");
      const taskId = e.dataTransfer.getData("text/plain");
      const t = state.tasks.find((x) => x.id === taskId);
      const newDate = cell.dataset.dropDate;
      if (t && newDate && t.date !== newDate) {
        t.date = newDate;
        t.updatedAt = nowIso();
        t.dirty = true;
        persist();
        trySync();
        scheduleReminders();
      }
      suppressNextClick = true;
      render();
    });
  });
}

function beginTimelineDrag(e, el, taskId, mode) {
  e.stopPropagation();
  e.preventDefault();
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  timelineDrag = {
    taskId, mode, startY: e.clientY, originStart: t.start, originDuration: t.duration,
    el, moved: false,
  };
  el.classList.add("dragging");
}

function bindGlobalPointerHandlers() {
  window.addEventListener("pointermove", (e) => {
    if (timelineDrag) {
      const deltaY = e.clientY - timelineDrag.startY;
      const moved = timelineDrag.moved || Math.abs(deltaY) > 4;
      const deltaMin = Math.round(deltaY / HOUR_H * 60 / SNAP) * SNAP;
      timelineDrag.moved = moved;
      if (timelineDrag.mode === "move") {
        const newStart = clamp(timelineDrag.originStart + deltaMin, GRID_START, GRID_END - SNAP);
        timelineDrag.previewStart = newStart;
        timelineDrag.el.style.top = (((newStart - GRID_START) / 60) * HOUR_H) + "px";
        const timeEl = timelineDrag.el.querySelector(".block-time");
        if (timeEl) timeEl.textContent = `${minutesToLabel(newStart)}–${minutesToLabel(newStart + timelineDrag.originDuration)}`;
      } else {
        const newDuration = Math.max(SNAP, timelineDrag.originDuration + deltaMin);
        timelineDrag.previewDuration = newDuration;
        timelineDrag.el.style.height = Math.max((newDuration / 60) * HOUR_H, 30) + "px";
        const timeEl = timelineDrag.el.querySelector(".block-time");
        if (timeEl) timeEl.textContent = `${minutesToLabel(timelineDrag.originStart)}–${minutesToLabel(timelineDrag.originStart + newDuration)}`;
      }
      return;
    }
    if (swipeDrag) {
      const dx = e.clientX - swipeDrag.startX;
      const dy = e.clientY - swipeDrag.startY;
      if (!swipeDrag.dragging && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) swipeDrag.dragging = true;
      if (swipeDrag.dragging) {
        swipeDrag.dx = dx;
        swipeDrag.el.style.transform = `translateX(${dx}px)`;
      }
    }
  });

  window.addEventListener("pointerup", () => {
    if (timelineDrag) {
      const d = timelineDrag;
      timelineDrag = null;
      d.el.classList.remove("dragging");
      if (d.moved) {
        suppressNextClick = true;
        const t = state.tasks.find((x) => x.id === d.taskId);
        if (t) {
          if (d.mode === "move") t.start = d.previewStart;
          else t.duration = d.previewDuration;
          t.updatedAt = nowIso(); t.dirty = true;
          persist(); trySync(); scheduleReminders();
        }
      }
      render();
      return;
    }
    if (swipeDrag) {
      const d = swipeDrag;
      swipeDrag = null;
      if (d.dragging) {
        suppressNextClick = true;
        if (d.dx > SWIPE_THRESHOLD) {
          toggleDone(d.taskId);
        } else if (d.dx < -SWIPE_THRESHOLD) {
          state.tasks = state.tasks.filter((t) => t.id !== d.taskId);
          state.pendingDeletes.tasks.push(d.taskId);
          persist(); render(); trySync(); scheduleReminders();
        } else {
          d.el.style.transform = "translateX(0)";
        }
      }
    }
  });
}

/* ---------- event delegation ---------- */
document.addEventListener("click", (e) => {
  if (suppressNextClick) { suppressNextClick = false; return; }
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;

  switch (a) {
    case "nav-prev-day": state.selectedDate = addDays(state.selectedDate, -1); materializeWindow(state.selectedDate, state.selectedDate); render(); break;
    case "nav-next-day": state.selectedDate = addDays(state.selectedDate, 1); materializeWindow(state.selectedDate, state.selectedDate); render(); break;
    case "nav-today": state.selectedDate = new Date(); render(); break;
    case "select-date": state.selectedDate = parseDateKey(el.dataset.date); state.view = "timeline"; materializeWindow(state.selectedDate, state.selectedDate); render(); break;
    case "cal-prev-month": state.monthCursor = addMonths(state.monthCursor, -1); materializeVisibleMonth(); render(); break;
    case "cal-next-month": state.monthCursor = addMonths(state.monthCursor, 1); materializeVisibleMonth(); render(); break;
    case "cal-jump-today": state.monthCursor = new Date(today.getFullYear(), today.getMonth(), 1); materializeVisibleMonth(); render(); break;
    case "quick-add-task": quickAddTask(); break;
    case "set-view": state.view = el.dataset.view; render(); break;
    case "toggle-dark": toggleDark(); break;
    case "open-add-sheet": openAddSheet({ date: el.dataset.date || "" }); break;
    case "open-edit-sheet": openEditSheet(el.dataset.id); break;
    case "toggle-done": e.stopPropagation(); toggleDone(el.dataset.id); break;
    case "close-sheet": closeSheet(); break;
    case "close-sheet-bg": if (e.target === el) closeSheet(); break;
    case "set-cat": sheetDraft.categoryId = el.dataset.id === "null" ? null : el.dataset.id; render(); break;
    case "set-pri": sheetDraft.priority = el.dataset.value === "null" ? null : el.dataset.value; render(); break;
    case "set-dur": sheetDraft.duration = Number(el.dataset.value); render(); break;
    case "set-repeat": sheetDraft.repeat = el.dataset.value; render(); break;
    case "set-reminder": {
      const v = el.dataset.value === "null" ? null : Number(el.dataset.value);
      sheetDraft.reminderOffset = v;
      if (v != null) requestNotifPermission();
      render();
      break;
    }
    case "end-series": deleteDraftSeries(); break;
    case "toggle-sheet-new-cat": sheetDraft.newCatOpen = !sheetDraft.newCatOpen; render(); break;
    case "sheet-set-swatch": sheetDraft.newCatColor = el.dataset.color; render(); break;
    case "sheet-submit-cat": submitNewCategorySheet(); break;
    case "remove-checklist-item": removeChecklistItem(el.dataset.id); break;
    case "add-checklist-item": addChecklistItem(); break;
    case "save-task": saveDraft(); break;
    case "delete-task": deleteDraft(); break;
    case "filter-cat": state.categoryFilter = el.dataset.id; render(); break;
    case "manage-open-cat-form": state.manageCatFormOpen = true; render(); break;
    case "manage-set-swatch": state.manageCatColor = el.dataset.color; render(); break;
    case "manage-submit-cat": submitNewCategoryManage(); break;
    case "manage-rename-start": state.editingCatId = el.dataset.id; render(); break;
    case "manage-rename-commit": commitRenameCategory(); break;
    case "manage-delete-cat": deleteCategoryAction(el.dataset.id); break;
    case "open-auth": state.authOpen = true; state.authMessage = ""; render(); break;
    case "close-auth": state.authOpen = false; render(); break;
    case "close-auth-bg": if (e.target === el) { state.authOpen = false; render(); } break;
    case "auth-toggle-mode": state.authMode = state.authMode === "signin" ? "signup" : "signin"; state.authMessage = ""; renderAuthOnly(); render(); break;
    case "do-sign-in": doSignIn(); break;
    case "do-sign-up": doSignUp(); break;
    case "sign-out": doSignOut(); break;
    case "dismiss-toast": dismissToast(el.dataset.id); break;
    case "open-import": state.importOpen = true; state.importMessage = ""; render(); break;
    case "close-import": state.importOpen = false; render(); break;
    case "close-import-bg": if (e.target === el) { state.importOpen = false; render(); } break;
    case "do-import": doImport(); break;
  }
});

/* keep sheetDraft title in sync when user types, without re-rendering the DOM */
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "f-title" && sheetDraft) sheetDraft.title = e.target.value;
});

/* ---------- boot ---------- */
async function boot() {
  const local = loadAllLocal();
  state.categories = local.categories;
  state.tasks = local.tasks;
  state.darkMode = local.darkMode;
  state.pendingDeletes = local.pendingDeletes;
  state.recurring = local.recurring;

  bindGlobalPointerHandlers();

  const windowStart = addDays(today, -7);
  const windowEnd = addDays(today, 60);
  materializeWindow(windowStart, windowEnd);

  render();
  scheduleReminders();
  setInterval(scheduleReminders, 60000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  supabase = await initSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    state.session = data && data.session ? data.session : null;
    render();
    if (state.session) trySync();
    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      render();
      if (session) trySync();
    });
    window.addEventListener("online", () => trySync());
  }
}

boot();

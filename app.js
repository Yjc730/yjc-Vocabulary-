import {
  addSet, getAllSets,
  addWord, updateWord, deleteWord,
  getAllCount, getDueWords, getWordsBySet,
  setMeta, getMeta,
  exportAll, importAll
} from "./db.js";
import { nextSRSState } from "./srs.js";

const $ = (id) => document.getElementById(id);

const els = {
  stats: $("stats"),

  // tabs
  tabs: document.querySelectorAll(".tab"),
  panels: {
    study: $("tab-study"),
    add: $("tab-add"),
    library: $("tab-library"),
    backup: $("tab-backup"),
  },

  // study
  reloadBtn: $("reloadBtn"),
  studySetSelect: $("studySetSelect"),
  modeSelect: $("modeSelect"),
  empty: $("empty"),
  reviewBox: $("reviewBox"),
  progressText: $("progressText"),
  cardBtn: $("cardBtn"),
  front: $("front"),
  frontSub: $("frontSub"),
  back: $("back"),
  exampleOut: $("exampleOut"),
  tagsOut: $("tagsOut"),

  // add
  addSetSelect: $("addSetSelect"),
  newSetName: $("newSetName"),
  createSetBtn: $("createSetBtn"),
  term: $("term"),
  pos: $("pos"),
  definition: $("definition"),
  example: $("example"),
  tags: $("tags"),
  addBtn: $("addBtn"),
  addMsg: $("addMsg"),

  // library
  libSetSelect: $("libSetSelect"),
  libSearch: $("libSearch"),
  libRefreshBtn: $("libRefreshBtn"),
  libBody: $("libBody"),
  editDialog: $("editDialog"),
  editId: $("editId"),
  editTerm: $("editTerm"),
  editPos: $("editPos"),
  editDef: $("editDef"),
  editEx: $("editEx"),
  editTags: $("editTags"),
  saveEditBtn: $("saveEditBtn"),
  editMsg: $("editMsg"),

  // backup
  exportBtn: $("exportBtn"),
  importFile: $("importFile"),
  importBtn: $("importBtn"),
  backupMsg: $("backupMsg"),
};

let dueList = [];
let idx = 0;
let flipped = false;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}
function nowISO() { return new Date().toISOString(); }

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
}

async function ensureDefaultSet() {
  const sets = await getAllSets();
  if (sets.length) return sets;

  const def = { id: uid(), name: "Default", createdAt: nowISO() };
  await addSet(def);
  return [def];
}

function fillSelect(select, sets, includeAll = true, selectedId = "all") {
  select.innerHTML = "";
  if (includeAll) {
    const opt = document.createElement("option");
    opt.value = "all";
    opt.textContent = "All Sets";
    select.appendChild(opt);
  }
  for (const s of sets) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  }
  select.value = selectedId;
}

async function refreshStats() {
  const total = await getAllCount();
  const setId = await getMeta("activeStudySetId") ?? "all";
  const due = (await getDueWords(nowISO(), setId)).length;
  els.stats.textContent = `總單字：${total}｜今日到期（此 Set）：${due}`;
}

async function saveSession() {
  await setMeta("lastSession", { idx, flipped, ts: nowISO() });
}
async function loadSession() {
  const s = await getMeta("lastSession");
  if (!s) return;
  idx = Number.isFinite(s.idx) ? s.idx : 0;
  flipped = !!s.flipped;
}

function clozeExample(term, example) {
  if (!example) return "";
  const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
  if (re.test(example)) return example.replace(re, "____");
  // 找不到 term 就用最簡單 fallback
  return example;
}
function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function buildCardView(word, mode) {
  const tags = (word.tags && word.tags.length) ? `Tags：${word.tags.join(", ")}` : "";
  const ex = word.example ? `例句：${word.example}` : "";

  if (mode === "zh2en") {
    return {
      front: word.definition || "(無中文)",
      frontSub: "想英文 term 再翻面",
      back: word.term,
      example: ex,
      tags,
    };
  }

  if (mode === "cloze") {
    const cloze = word.example ? clozeExample(word.term, word.example) : "(請先補例句才有挖空)";
    return {
      front: cloze,
      frontSub: "把空格填回正確單字",
      back: `${word.term}  —  ${word.definition || ""}`.trim(),
      example: word.example ? `原句：${word.example}` : "",
      tags,
    };
  }

  // en2zh
  return {
    front: word.term,
    frontSub: word.pos ? `${word.pos}` : "想中文意思再翻面",
    back: word.definition || "(無中文)",
    example: ex,
    tags,
  };
}

function renderStudy() {
  if (!dueList.length) {
    els.reviewBox.classList.add("hidden");
    els.empty.classList.remove("hidden");
    return;
  }
  els.reviewBox.classList.remove("hidden");
  els.empty.classList.add("hidden");

  if (idx >= dueList.length) idx = 0;
  const w = dueList[idx];
  const mode = els.modeSelect.value;

  els.progressText.textContent = `${idx + 1} / ${dueList.length}`;

  const view = buildCardView(w, mode);
  els.front.textContent = view.front;
  els.frontSub.textContent = view.frontSub;
  els.back.textContent = view.back;
  els.exampleOut.textContent = view.example || "";
  els.tagsOut.textContent = view.tags || "";

  if (flipped) els.cardBtn.classList.add("is-flipped");
  else els.cardBtn.classList.remove("is-flipped");
}

async function loadDue({ useSavedSession = true } = {}) {
  const setId = els.studySetSelect.value || "all";
  await setMeta("activeStudySetId", setId);

  dueList = await getDueWords(nowISO(), setId);

  if (!dueList.length) {
    idx = 0; flipped = false;
    await saveSession();
    renderStudy();
    await refreshStats();
    return;
  }

  if (useSavedSession) await loadSession();
  if (idx >= dueList.length) idx = 0;
  renderStudy();
  await refreshStats();
}

async function rateCurrent(score) {
  if (!dueList.length) return;
  const w = dueList[idx];
  const next = nextSRSState(w, score);
  await updateWord(w.id, next);

  flipped = false;
  await loadDue({ useSavedSession: false });
  await saveSession();
}

/** Tabs */
function setActiveTab(name) {
  for (const t of els.tabs) {
    t.classList.toggle("is-active", t.dataset.tab === name);
  }
  for (const [k, p] of Object.entries(els.panels)) {
    p.classList.toggle("hidden", k !== name);
  }
  setMeta("activeTab", name);
}

/** Library */
function fmtDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
  } catch { return "-"; }
}

async function renderLibrary() {
  const setId = els.libSetSelect.value || "all";
  const q = els.libSearch.value.trim().toLowerCase();

  const words = await getWordsBySet(setId);
  const filtered = q
    ? words.filter(w => {
        const hay = [
          w.term, w.definition, w.example,
          (w.tags || []).join(","),
        ].join(" ").toLowerCase();
        return hay.includes(q);
      })
    : words;

  // sort: due soon first
  filtered.sort((a,b) => String(a.dueAt||"").localeCompare(String(b.dueAt||"")));

  els.libBody.innerHTML = "";
  for (const w of filtered) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(w.term || "")}</td>
      <td>${escapeHtml(w.definition || "")}</td>
      <td>${escapeHtml(w.example || "")}</td>
      <td>${escapeHtml((w.tags||[]).join(", "))}</td>
      <td>${escapeHtml(fmtDate(w.dueAt))}</td>
      <td>
        <button class="btn btn-ghost mini" data-act="edit" data-id="${w.id}">編輯</button>
        <button class="btn btn-ghost mini danger" data-act="del" data-id="${w.id}">刪除</button>
      </td>
    `;
    els.libBody.appendChild(tr);
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/** Backup */
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Init */
async function init() {
  const sets = await ensureDefaultSet();

  const activeSetId = (await getMeta("activeStudySetId")) ?? "all";
  fillSelect(els.studySetSelect, sets, true, activeSetId);
  fillSelect(els.addSetSelect, sets, false, sets[0].id);
  fillSelect(els.libSetSelect, sets, true, "all");

  const mode = (await getMeta("studyMode")) ?? "en2zh";
  els.modeSelect.value = mode;

  const tab = (await getMeta("activeTab")) ?? "study";
  setActiveTab(tab);

  await loadDue({ useSavedSession: true });
  await renderLibrary();
}

/** Events */
for (const t of els.tabs) {
  t.addEventListener("click", async () => {
    setActiveTab(t.dataset.tab);
    if (t.dataset.tab === "library") await renderLibrary();
  });
}

els.modeSelect.addEventListener("change", async () => {
  await setMeta("studyMode", els.modeSelect.value);
  flipped = false;
  await saveSession();
  renderStudy();
});

els.studySetSelect.addEventListener("change", async () => {
  idx = 0; flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: false });
});

els.reloadBtn.onclick = async () => {
  idx = 0; flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: false });
};

els.cardBtn.onclick = async () => {
  flipped = !flipped;
  await saveSession();
  renderStudy();
};

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".rate");
  if (btn) return rateCurrent(Number(btn.dataset.score));

  const act = e.target.closest("[data-act]")?.dataset.act;
  const id = e.target.closest("[data-id]")?.dataset.id;
  if (!act || !id) return;

  if (act === "del") {
    const ok = confirm("確定要刪除這個單字？");
    if (!ok) return;
    await deleteWord(id);
    await renderLibrary();
    await refreshStats();
    await loadDue({ useSavedSession: false });
    return;
  }

  if (act === "edit") {
    // load word from table list quickly: re-fetch by set then find
    const setId = els.libSetSelect.value || "all";
    const words = await getWordsBySet(setId);
    const w = words.find(x => x.id === id) || (await getWordsBySet("all")).find(x => x.id === id);
    if (!w) return;

    els.editId.value = w.id;
    els.editTerm.value = w.term || "";
    els.editPos.value = w.pos || "";
    els.editDef.value = w.definition || "";
    els.editEx.value = w.example || "";
    els.editTags.value = (w.tags || []).join(", ");
    els.editMsg.textContent = "";
    els.editDialog.showModal();
  }
});

els.saveEditBtn.onclick = async () => {
  const id = els.editId.value;
  if (!id) return;

  await updateWord(id, {
    term: els.editTerm.value.trim(),
    pos: els.editPos.value.trim(),
    definition: els.editDef.value.trim(),
    example: els.editEx.value.trim(),
    tags: els.editTags.value.split(",").map(s => s.trim()).filter(Boolean),
  });

  els.editMsg.textContent = "已儲存 ✅";
  await renderLibrary();
  await refreshStats();
  await loadDue({ useSavedSession: false });

  setTimeout(() => (els.editMsg.textContent = ""), 900);
};

els.libRefreshBtn.onclick = renderLibrary;
els.libSetSelect.addEventListener("change", renderLibrary);
els.libSearch.addEventListener("input", () => {
  // 小 debounce
  clearTimeout(window.__libT);
  window.__libT = setTimeout(renderLibrary, 120);
});

// Add set
els.createSetBtn.onclick = async () => {
  const name = els.newSetName.value.trim();
  if (!name) return;

  const setObj = { id: uid(), name, createdAt: nowISO() };
  await addSet(setObj);

  els.newSetName.value = "";

  const sets = await getAllSets();
  fillSelect(els.studySetSelect, sets, true, els.studySetSelect.value || "all");
  fillSelect(els.addSetSelect, sets, false, setObj.id);
  fillSelect(els.libSetSelect, sets, true, els.libSetSelect.value || "all");
};

// Add word
els.addBtn.onclick = async () => {
  const term = els.term.value.trim();
  if (!term) return;

  const setId = els.addSetSelect.value;
  const word = {
    id: uid(),
    setId,
    term,
    pos: els.pos.value.trim(),
    definition: els.definition.value.trim(),
    example: els.example.value.trim(),
    tags: els.tags.value.split(",").map(s => s.trim()).filter(Boolean),

    repetitions: 0,
    intervalDays: 0,
    ease: 2.3,
    lastReviewedAt: null,
    dueAt: nowISO(),
    createdAt: nowISO(),
  };

  await addWord(word);

  els.addMsg.textContent = `已加入：${term}`;
  els.term.value = els.pos.value = els.definition.value = els.example.value = els.tags.value = "";

  await loadDue({ useSavedSession: false });
  await renderLibrary();
  setTimeout(() => (els.addMsg.textContent = ""), 1200);
};

// Backup export/import
els.exportBtn.onclick = async () => {
  const payload = await exportAll();
  const name = `my-vocab-backup-${new Date().toISOString().slice(0,10)}.json`;
  downloadJSON(payload, name);
  els.backupMsg.textContent = "已匯出 ✅";
  setTimeout(() => (els.backupMsg.textContent = ""), 1000);
};

els.importBtn.onclick = async () => {
  const f = els.importFile.files?.[0];
  if (!f) return;

  try {
    const text = await f.text();
    const payload = JSON.parse(text);
    await importAll(payload);

    els.backupMsg.textContent = "匯入完成 ✅";
    await init(); // 重新初始化 UI
    setTimeout(() => (els.backupMsg.textContent = ""), 1200);
  } catch (err) {
    els.backupMsg.textContent = "匯入失敗：請確認 JSON 格式";
  }
};

// Shortcuts
document.addEventListener("keydown", async (e) => {
  if (isTyping()) return;

  if (e.key === " ") {
    e.preventDefault();
    flipped = !flipped;
    await saveSession();
    renderStudy();
    return;
  }
  if (e.key === "1") return rateCurrent(1);
  if (e.key === "2") return rateCurrent(2);
  if (e.key === "3") return rateCurrent(3);
});

await init();

import {
  addFolder, getAllFolders,
  addSet, getAllSets, getSetsByFolder,
  addWord, updateWord, deleteWord,
  getAllCount, getDueWords, getWordsBySet,
  setMeta, getMeta,
  exportAll, importAll
} from "./db.js";

import { nextSRSState } from "./srs.js";

const $ = (id) => document.getElementById(id);

const els = {
  stats: $("stats"),

  // tabs & panels
  tabs: document.querySelectorAll(".tab"),
  panels: {
    home: $("tab-home"),
    study: $("tab-study"),
    add: $("tab-add"),
    library: $("tab-library"),
    backup: $("tab-backup"),
  },

  // Home cards
  homeFolderSelect: $("homeFolderSelect"),
  homeSearch: $("homeSearch"),
  cardsWrap: $("cardsWrap"),

  // Study
  reloadBtn: $("reloadBtn"),
  studyFolderSelect: $("studyFolderSelect"),
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
  todayText: $("todayText"),
  todayDoneText: $("todayDoneText"),
  todayBar: $("todayBar"),

  // Add
  addFolderSelect: $("addFolderSelect"),
  newFolderName: $("newFolderName"),
  createFolderBtn: $("createFolderBtn"),
  addSetSelect: $("addSetSelect"),
  newSetName: $("newSetName"),
  createSetBtn: $("createSetBtn"),
  examTitle: $("examTitle"),
  examDate: $("examDate"),
  saveExamBtn: $("saveExamBtn"),
  examMsg: $("examMsg"),
  term: $("term"),
  pos: $("pos"),
  definition: $("definition"),
  example: $("example"),
  tags: $("tags"),
  addBtn: $("addBtn"),
  addMsg: $("addMsg"),

  // Library
  libFolderSelect: $("libFolderSelect"),
  libSetSelect: $("libSetSelect"),
  libSearch: $("libSearch"),
  libRefreshBtn: $("libRefreshBtn"),
  libBody: $("libBody"),
  viewTableBtn: $("viewTableBtn"),
  viewNotebookBtn: $("viewNotebookBtn"),
  printNotebookBtn: $("printNotebookBtn"),
  tableView: $("tableView"),
  notebookView: $("notebookView"),
  notebookContent: $("notebookContent"),

  // Edit modal
  editDialog: $("editDialog"),
  editId: $("editId"),
  editTerm: $("editTerm"),
  editPos: $("editPos"),
  editDef: $("editDef"),
  editEx: $("editEx"),
  editTags: $("editTags"),
  saveEditBtn: $("saveEditBtn"),
  editMsg: $("editMsg"),

  // Backup
  exportBtn: $("exportBtn"),
  importFile: $("importFile"),
  importBtn: $("importBtn"),
  backupMsg: $("backupMsg"),
};

let folders = [];
let sets = [];

let dueList = [];
let idx = 0;
let flipped = false;

// 今日統計：你今天「評分」了幾張
let todayReviewed = 0;

// Library view
let libView = "table"; // table | notebook

// ---------- utils ----------
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}
function nowISO() { return new Date().toISOString(); }

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
  } catch { return "-"; }
}

function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = target.getTime() - base.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function setActiveTab(name) {
  for (const t of els.tabs) t.classList.toggle("is-active", t.dataset.tab === name);
  for (const [k, p] of Object.entries(els.panels)) {
    if (!p) continue;
    p.classList.toggle("hidden", k !== name);
  }
  setMeta("activeTab", name);
}

function fillSelect(select, items, { includeAll = true, allLabel = "All", selected = "all", textKey="name" } = {}) {
  if (!select) return;
  select.innerHTML = "";
  if (includeAll) {
    const opt = document.createElement("option");
    opt.value = "all";
    opt.textContent = allLabel;
    select.appendChild(opt);
  }
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it[textKey];
    select.appendChild(opt);
  }
  select.value = selected;
}

// ---------- session ----------
async function saveSession() {
  await setMeta("lastSession", { idx, flipped, ts: nowISO() });
}
async function loadSession() {
  const s = await getMeta("lastSession");
  if (!s) return;
  idx = Number.isFinite(s.idx) ? s.idx : 0;
  flipped = !!s.flipped;
}

// ---------- stats ----------
async function refreshStats() {
  const total = await getAllCount();
  if (els.stats) els.stats.textContent = `總單字：${total}`;
}

// ---------- today progress ----------
async function loadTodayProgress() {
  const k = `todayReviewed:${todayKey()}`;
  todayReviewed = (await getMeta(k)) ?? 0;
  renderTodayProgress();
}
function renderTodayProgress() {
  const done = todayReviewed;
  const remain = dueList.length;
  const totalPlan = done + remain;
  const pct = totalPlan ? Math.round((done / totalPlan) * 100) : 0;

  if (els.todayText) els.todayText.textContent = `今日進度：${done} / ${totalPlan}`;
  if (els.todayDoneText) els.todayDoneText.textContent = `今日完成：${done}`;
  if (els.todayBar) els.todayBar.style.width = `${pct}%`;
}
async function incTodayReviewed() {
  const k = `todayReviewed:${todayKey()}`;
  todayReviewed = (todayReviewed ?? 0) + 1;
  await setMeta(k, todayReviewed);
}

// ---------- study card view ----------
function clozeExample(term, example) {
  if (!example) return "(請先補例句才有挖空)";
  const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
  if (re.test(example)) return example.replace(re, "____");
  return example;
}

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
    const cloze = clozeExample(word.term, word.example);
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
    els.reviewBox?.classList.add("hidden");
    els.empty?.classList.remove("hidden");
    renderTodayProgress();
    return;
  }
  els.reviewBox?.classList.remove("hidden");
  els.empty?.classList.add("hidden");

  if (idx >= dueList.length) idx = 0;
  const w = dueList[idx];
  const mode = els.modeSelect?.value || "en2zh";

  if (els.progressText) els.progressText.textContent = `${idx + 1} / ${dueList.length}`;

  const view = buildCardView(w, mode);
  if (els.front) els.front.textContent = view.front;
  if (els.frontSub) els.frontSub.textContent = view.frontSub;
  if (els.back) els.back.textContent = view.back;
  if (els.exampleOut) els.exampleOut.textContent = view.example || "";
  if (els.tagsOut) els.tagsOut.textContent = view.tags || "";

  els.cardBtn?.classList.toggle("is-flipped", flipped);
  renderTodayProgress();
}

async function refreshSetSelectsByFolder() {
  const studyFolderId = els.studyFolderSelect?.value || "all";
  const addFolderId = els.addFolderSelect?.value || "all";
  const libFolderId = els.libFolderSelect?.value || "all";

  const studySets = await getSetsByFolder(studyFolderId);
  const addSets = await getSetsByFolder(addFolderId);
  const libSets = await getSetsByFolder(libFolderId);

  const keepStudySet = els.studySetSelect?.value || (await getMeta("activeStudySetId")) || "all";
  const keepAddSet = els.addSetSelect?.value || (addSets[0]?.id ?? "all");
  const keepLibSet = els.libSetSelect?.value || "all";

  fillSelect(els.studySetSelect, studySets, { includeAll: true, allLabel: "All Sets", selected: keepStudySet });
  fillSelect(els.addSetSelect, addSets, { includeAll: false, selected: keepAddSet });
  fillSelect(els.libSetSelect, libSets, { includeAll: true, allLabel: "All Sets", selected: keepLibSet });
}

async function loadDue({ useSavedSession = true } = {}) {
  const setId = els.studySetSelect?.value || "all";
  await setMeta("activeStudySetId", setId);
  await setMeta("studyMode", els.modeSelect?.value || "en2zh");

  dueList = await getDueWords(nowISO(), setId);

  await loadTodayProgress();

  if (!dueList.length) {
    idx = 0; flipped = false;
    await saveSession();
    renderStudy();
    return;
  }

  if (useSavedSession) await loadSession();
  if (idx >= dueList.length) idx = 0;
  renderStudy();
}

async function rateCurrent(score) {
  if (!dueList.length) return;

  const w = dueList[idx];
  const next = nextSRSState(w, score);
  await updateWord(w.id, next);

  await incTodayReviewed();

  flipped = false;
  await loadDue({ useSavedSession: false });
  await saveSession();
}

// ---------- swipe support ----------
function setupSwipe() {
  if (!els.cardBtn) return;

  let startX = 0, startY = 0, dragging = false;

  els.cardBtn.addEventListener("pointerdown", (e) => {
    if (isTyping()) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    els.cardBtn.setPointerCapture?.(e.pointerId);
  });

  els.cardBtn.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) return;

    if (dx < -25) {
      els.cardBtn.classList.add("swipe-left");
      els.cardBtn.classList.remove("swipe-right");
    } else if (dx > 25) {
      els.cardBtn.classList.add("swipe-right");
      els.cardBtn.classList.remove("swipe-left");
    } else {
      els.cardBtn.classList.remove("swipe-left", "swipe-right");
    }
  });

  els.cardBtn.addEventListener("pointerup", async (e) => {
    if (!dragging) return;
    dragging = false;

    const dx = e.clientX - startX;
    els.cardBtn.classList.remove("swipe-left", "swipe-right");

    if (dx < -80) return rateCurrent(1);
    if (dx > 80)  return rateCurrent(3);
  });

  els.cardBtn.addEventListener("pointercancel", () => {
    dragging = false;
    els.cardBtn.classList.remove("swipe-left", "swipe-right");
  });
}

// ---------- add ----------
async function createFolder() {
  const name = els.newFolderName?.value?.trim();
  if (!name) return;

  await addFolder({ id: uid(), name, createdAt: nowISO() });
  els.newFolderName.value = "";
  await hydrateSelectors();
  await renderHomeCards();
}

async function createSet() {
  const folderId = els.addFolderSelect?.value;
  const name = els.newSetName?.value?.trim();
  if (!folderId || !name) return;

  await addSet({
    id: uid(),
    folderId,
    name,
    examTitle: "",
    examDate: "",
    createdAt: nowISO()
  });

  els.newSetName.value = "";
  await hydrateSelectors();
  await renderHomeCards();
}

async function saveExamForCurrentSet() {
  const setId = els.addSetSelect?.value;
  if (!setId) return;

  const all = await getAllSets();
  const s = all.find(x => x.id === setId);
  if (!s) return;

  s.examTitle = els.examTitle?.value?.trim() || "";
  s.examDate = els.examDate?.value || "";
  await addSet(s);

  if (els.examMsg) {
    els.examMsg.textContent = "已儲存本單元考試資訊 ✅";
    setTimeout(() => (els.examMsg.textContent = ""), 1000);
  }

  await renderHomeCards();
  await renderNotebook();
}

async function addWordFromForm() {
  const term = els.term?.value?.trim();
  if (!term) return;

  const setId = els.addSetSelect?.value;
  const word = {
    id: uid(),
    setId,
    term,
    pos: els.pos?.value?.trim() || "",
    definition: els.definition?.value?.trim() || "",
    example: els.example?.value?.trim() || "",
    tags: (els.tags?.value || "").split(",").map(s => s.trim()).filter(Boolean),

    repetitions: 0,
    intervalDays: 0,
    ease: 2.3,
    lastReviewedAt: null,
    dueAt: nowISO(),
    createdAt: nowISO(),
  };

  await addWord(word);

  if (els.addMsg) {
    els.addMsg.textContent = `已加入：${term}`;
    setTimeout(() => (els.addMsg.textContent = ""), 1000);
  }

  els.term && (els.term.value = "");
  els.pos && (els.pos.value = "");
  els.definition && (els.definition.value = "");
  els.example && (els.example.value = "");
  els.tags && (els.tags.value = "");

  await loadDue({ useSavedSession: false });
  await renderLibrary();
  await renderHomeCards();
}

// ---------- library ----------
function setLibView(v) {
  libView = v;
  els.tableView?.classList.toggle("hidden", v !== "table");
  els.notebookView?.classList.toggle("hidden", v !== "notebook");

  if (els.viewTableBtn) {
    els.viewTableBtn.classList.toggle("btn-soft", v === "table");
    els.viewTableBtn.classList.toggle("btn-ghost", v !== "table");
  }
  if (els.viewNotebookBtn) {
    els.viewNotebookBtn.classList.toggle("btn-soft", v === "notebook");
    els.viewNotebookBtn.classList.toggle("btn-ghost", v !== "notebook");
  }
}

async function renderLibrary() {
  const setId = els.libSetSelect?.value || "all";
  const q = (els.libSearch?.value || "").trim().toLowerCase();

  const words = await getWordsBySet(setId);
  const filtered = q
    ? words.filter(w => {
        const hay = [
          w.term, w.pos, w.definition,
          (w.tags || []).join(","),
        ].join(" ").toLowerCase();
        return hay.includes(q);
      })
    : words;

  filtered.sort((a,b) => String(a.term||"").localeCompare(String(b.term||"")));

  if (els.libBody) {
    els.libBody.innerHTML = "";
    for (const w of filtered) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(w.term)}</td>
        <td>${escapeHtml(w.pos)}</td>
        <td>${escapeHtml(w.definition)}</td>
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

  await renderNotebook();
  await refreshStats();
}

async function renderNotebook() {
  if (!els.notebookContent) return;

  const folderId = els.libFolderSelect?.value || "all";
  const setId = els.libSetSelect?.value || "all";

  const folder = folders.find(f => f.id === folderId);
  const showingFolderName = folderId === "all" ? "All Folders" : (folder?.name ?? "Folder");
  const showingSetName = setId === "all" ? "All Sets" : (sets.find(s => s.id === setId)?.name ?? "Set");

  const scopedSets = (setId !== "all")
    ? sets.filter(s => s.id === setId)
    : (folderId === "all" ? sets : sets.filter(s => s.folderId === folderId));

  let html = `
    <div class="nbHeader">
      <div>
        <div class="nbTitle">單字薄：${escapeHtml(showingFolderName)} / ${escapeHtml(showingSetName)}</div>
        <div class="nbSub">欄位：英文 / 詞性 / 中文（適合快速讀）</div>
      </div>
      <div class="nbSub">${escapeHtml(new Date().toLocaleString())}</div>
    </div>
  `;

  for (const s of scopedSets) {
    const words = await getWordsBySet(s.id);
    words.sort((a,b) => String(a.term||"").localeCompare(String(b.term||"")));

    const examLine = (s.examTitle || s.examDate)
      ? `本單元考試：${escapeHtml(s.examTitle || "-")} ${s.examDate ? `（${escapeHtml(s.examDate)}）` : ""}`
      : "";

    html += `
      <div class="nbSection">
        <div class="nbSectionTitle">${escapeHtml(s.name)}</div>
        ${examLine ? `<div class="nbExam">${examLine}</div>` : ""}
        <table class="nbTable">
          <thead><tr><th style="width:30%">英文</th><th style="width:15%">詞性</th><th>中文</th></tr></thead>
          <tbody>
            ${words.map(w => `
              <tr>
                <td><b>${escapeHtml(w.term)}</b></td>
                <td>${escapeHtml(w.pos)}</td>
                <td>${escapeHtml(w.definition)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  els.notebookContent.innerHTML = html;
}

// ---------- home cards ----------
async function renderHomeCards() {
  if (!els.cardsWrap || !els.homeFolderSelect) return;

  const folderId = els.homeFolderSelect.value || "all";
  const q = (els.homeSearch?.value || "").trim().toLowerCase();

  let scopedSets = (folderId === "all")
    ? sets
    : sets.filter(s => s.folderId === folderId);

  if (q) scopedSets = scopedSets.filter(s => (s.name || "").toLowerCase().includes(q));

  const now = nowISO();
  const rows = [];
  for (const s of scopedSets) {
    const words = await getWordsBySet(s.id);
    const due = (await getDueWords(now, s.id)).length;

    const dleft = daysUntil(s.examDate);
    const examBadge =
      s.examDate
        ? (dleft < 0 ? { text: "考試已過", cls: "badge" }
          : dleft === 0 ? { text: "今天考試", cls: "badge red" }
          : { text: `倒數 ${dleft} 天`, cls: "badge red" })
        : null;

    rows.push({
      set: s,
      wordCount: words.length,
      dueCount: due,
      examBadge,
    });
  }

  rows.sort((a,b) => {
    if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
    const ad = daysUntil(a.set.examDate) ?? 99999;
    const bd = daysUntil(b.set.examDate) ?? 99999;
    return ad - bd;
  });

  const folderName = folderId === "all"
    ? "All Folders"
    : (folders.find(f => f.id === folderId)?.name ?? "Folder");

  els.cardsWrap.innerHTML = `
    <div class="folderBar" style="grid-column:1/-1;">
      <div class="folderTitle">${escapeHtml(folderName)}</div>
      <div class="folderMeta">Sets：${rows.length}</div>
    </div>
  `;

  if (!rows.length) {
    els.cardsWrap.innerHTML += `<div class="empty" style="grid-column:1/-1;">這個 Folder 目前沒有 Set（去 Add 建一個）</div>`;
    return;
  }

  for (const r of rows) {
    const s = r.set;
    const dueBadge = r.dueCount > 0
      ? `<span class="badge blue">今日到期 ${r.dueCount}</span>`
      : `<span class="badge">今日到期 0</span>`;

    const examTitle = (s.examTitle || "").trim();
    const examBadge = r.examBadge ? `<span class="${r.examBadge.cls}">${escapeHtml(r.examBadge.text)}</span>` : "";
    const examLine = (examTitle || s.examDate)
      ? `考試：${escapeHtml(examTitle || "-")} ${s.examDate ? `(${escapeHtml(s.examDate)})` : ""}`
      : "考試：未設定";

    const card = document.createElement("div");
    card.className = "setCard";
    card.innerHTML = `
      <div class="setTop">
        <div>
          <div class="setName">${escapeHtml(s.name)}</div>
          <div class="small">${escapeHtml(examLine)}</div>
        </div>
        <div class="badges">
          ${dueBadge}
          ${examBadge}
        </div>
      </div>

      <div class="cardStats">
        <div>單字：<b>${r.wordCount}</b></div>
        <div>Folder：<b>${escapeHtml(folderName)}</b></div>
      </div>

      <div class="cardActions">
        <button class="btn btn-primary" data-home-act="study" data-set="${s.id}" type="button">開始複習</button>
        <button class="btn btn-soft" data-home-act="notebook" data-set="${s.id}" type="button">看單字薄</button>
      </div>
    `;
    els.cardsWrap.appendChild(card);
  }
}

// ---------- backup ----------
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

// ---------- hydrate selectors ----------
async function hydrateSelectors() {
  folders = (await getAllFolders()).sort((a,b) => a.name.localeCompare(b.name));
  sets = (await getAllSets()).sort((a,b) => a.name.localeCompare(b.name));

  const activeTab = (await getMeta("activeTab")) ?? "home";
  const studyFolder = (await getMeta("studyFolderId")) ?? "all";
  const libFolder = (await getMeta("libFolderId")) ?? "all";

  fillSelect(els.studyFolderSelect, folders, { includeAll:true, allLabel:"All Folders", selected: studyFolder });
  fillSelect(els.addFolderSelect, folders, { includeAll:false, selected: folders[0]?.id ?? "all" });
  fillSelect(els.libFolderSelect, folders, { includeAll:true, allLabel:"All Folders", selected: libFolder });
  fillSelect(els.homeFolderSelect, folders, { includeAll:true, allLabel:"All Folders", selected: "all" });

  await refreshSetSelectsByFolder();

  const mode = (await getMeta("studyMode")) ?? "en2zh";
  if (els.modeSelect) els.modeSelect.value = mode;

  const lv = (await getMeta("libView")) ?? "table";
  setLibView(lv);

  setActiveTab(activeTab);
}

// ---------- events ----------
for (const t of els.tabs) {
  t.addEventListener("click", async () => {
    setActiveTab(t.dataset.tab);

    if (t.dataset.tab === "home") await renderHomeCards();
    if (t.dataset.tab === "library") await renderLibrary();
  });
}

// Home filters
els.homeFolderSelect?.addEventListener("change", renderHomeCards);
els.homeSearch?.addEventListener("input", () => {
  clearTimeout(window.__homeT);
  window.__homeT = setTimeout(renderHomeCards, 150);
});

// Home card actions
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-home-act]");
  if (!btn) return;

  const act = btn.dataset.homeAct;
  const setId = btn.dataset.set;

  if (els.studySetSelect) els.studySetSelect.value = setId;
  await setMeta("activeStudySetId", setId);

  idx = 0; flipped = false;
  await saveSession();

  if (act === "study") {
    setActiveTab("study");
    await loadDue({ useSavedSession: false });
    return;
  }

  if (act === "notebook") {
    setActiveTab("library");
    if (els.libSetSelect) els.libSetSelect.value = setId;
    setLibView("notebook");
    await setMeta("libView", "notebook");
    await renderLibrary();
    return;
  }
});

// Study filters
els.studyFolderSelect?.addEventListener("change", async () => {
  await setMeta("studyFolderId", els.studyFolderSelect.value || "all");
  await refreshSetSelectsByFolder();
  idx = 0; flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: false });
});

els.studySetSelect?.addEventListener("change", async () => {
  idx = 0; flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: false });
});

els.modeSelect?.addEventListener("change", async () => {
  await setMeta("studyMode", els.modeSelect.value);
  flipped = false;
  await saveSession();
  renderStudy();
});

els.reloadBtn?.addEventListener("click", async () => {
  idx = 0; flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: false });
});

els.cardBtn?.addEventListener("click", async () => {
  flipped = !flipped;
  await saveSession();
  renderStudy();
});

// Rate buttons + library actions (edit/del)
document.addEventListener("click", async (e) => {
  const rateBtn = e.target.closest(".rate");
  if (rateBtn) return rateCurrent(Number(rateBtn.dataset.score));

  const act = e.target.closest("[data-act]")?.dataset.act;
  const id = e.target.closest("[data-id]")?.dataset.id;
  if (!act || !id) return;

  if (act === "del") {
    const ok = confirm("確定要刪除這個單字？");
    if (!ok) return;
    await deleteWord(id);
    await renderLibrary();
    await loadDue({ useSavedSession: false });
    await renderHomeCards();
    return;
  }

  if (act === "edit") {
    const setId = els.libSetSelect?.value || "all";
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

els.saveEditBtn?.addEventListener("click", async () => {
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
  await loadDue({ useSavedSession: false });
  await renderHomeCards();

  setTimeout(() => (els.editMsg.textContent = ""), 900);
});

// Add: folder/set
els.createFolderBtn?.addEventListener("click", createFolder);
els.addFolderSelect?.addEventListener("change", refreshSetSelectsByFolder);
els.createSetBtn?.addEventListener("click", createSet);

els.addSetSelect?.addEventListener("change", async () => {
  const s = (await getAllSets()).find(x => x.id === els.addSetSelect.value);
  if (els.examTitle) els.examTitle.value = s?.examTitle || "";
  if (els.examDate) els.examDate.value = s?.examDate || "";
});

els.saveExamBtn?.addEventListener("click", saveExamForCurrentSet);
els.addBtn?.addEventListener("click", addWordFromForm);

// Library filters
els.libFolderSelect?.addEventListener("change", async () => {
  await setMeta("libFolderId", els.libFolderSelect.value || "all");
  await refreshSetSelectsByFolder();
  await renderLibrary();
});
els.libSetSelect?.addEventListener("change", renderLibrary);

els.libSearch?.addEventListener("input", () => {
  clearTimeout(window.__libT);
  window.__libT = setTimeout(renderLibrary, 120);
});
els.libRefreshBtn?.addEventListener("click", renderLibrary);

els.viewTableBtn?.addEventListener("click", async () => {
  setLibView("table");
  await setMeta("libView", "table");
});
els.viewNotebookBtn?.addEventListener("click", async () => {
  setLibView("notebook");
  await setMeta("libView", "notebook");
  await renderNotebook();
});
els.printNotebookBtn?.addEventListener("click", () => {
  setLibView("notebook");
  window.print();
});

// Backup
els.exportBtn?.addEventListener("click", async () => {
  const payload = await exportAll();
  const name = `my-vocab-backup-${new Date().toISOString().slice(0,10)}.json`;
  downloadJSON(payload, name);
  if (els.backupMsg) {
    els.backupMsg.textContent = "已匯出 ✅";
    setTimeout(() => (els.backupMsg.textContent = ""), 1000);
  }
});

els.importBtn?.addEventListener("click", async () => {
  const f = els.importFile?.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const payload = JSON.parse(text);
    await importAll(payload);
    if (els.backupMsg) els.backupMsg.textContent = "匯入完成 ✅";
    await init();
    setTimeout(() => (els.backupMsg.textContent = ""), 1200);
  } catch {
    if (els.backupMsg) els.backupMsg.textContent = "匯入失敗：請確認 JSON 格式";
  }
});

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

// ---------- init ----------
async function init() {
  await hydrateSelectors();

  if (els.addSetSelect?.value) {
    const s = (await getAllSets()).find(x => x.id === els.addSetSelect.value);
    if (els.examTitle) els.examTitle.value = s?.examTitle || "";
    if (els.examDate) els.examDate.value = s?.examDate || "";
  }

  await refreshStats();
  await loadDue({ useSavedSession: true });
  await renderLibrary();
  await renderHomeCards();
  setupSwipe();
}

await init();

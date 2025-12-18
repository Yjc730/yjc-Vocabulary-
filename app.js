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

  tabs: document.querySelectorAll(".tab"),
  panels: {
    study: $("tab-study"),
    add: $("tab-add"),
    library: $("tab-library"),
    backup: $("tab-backup"),
  },

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

// 今日統計
let todayDueStart = 0;       // 今日一開始的 due 總量（依目前範圍）
let todayReviewed = 0;       // 今日你評分了幾張

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

function setActiveTab(name) {
  for (const t of els.tabs) t.classList.toggle("is-active", t.dataset.tab === name);
  for (const [k, p] of Object.entries(els.panels)) p.classList.toggle("hidden", k !== name);
  setMeta("activeTab", name);
}

function fillSelect(select, items, { includeAll = true, allLabel = "All", selected = "all", textKey="name" } = {}) {
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

async function refreshStats() {
  const total = await getAllCount();
  els.stats.textContent = `總單字：${total}`;
}

/** ===== Study: 卡片內容（模式） ===== */
function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
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

/** ===== 今日進度 UI ===== */
async function loadTodayProgress() {
  const k = `todayReviewed:${todayKey()}`;
  todayReviewed = (await getMeta(k)) ?? 0;

  // todayDueStart 會在 loadDue() 算
  renderTodayProgress();
}

function renderTodayProgress() {
  const done = todayReviewed;
  const remain = dueList.length;
  const totalPlan = done + remain; // 當下範圍下，已做 + 還沒做
  const pct = totalPlan ? Math.round((done / totalPlan) * 100) : 0;

  els.todayText.textContent = `今日進度：${done} / ${totalPlan}`;
  els.todayDoneText.textContent = `今日完成：${done}`;
  els.todayBar.style.width = `${pct}%`;
}

/** ===== Session ===== */
async function saveSession() {
  await setMeta("lastSession", { idx, flipped, ts: nowISO() });
}
async function loadSession() {
  const s = await getMeta("lastSession");
  if (!s) return;
  idx = Number.isFinite(s.idx) ? s.idx : 0;
  flipped = !!s.flipped;
}

/** ===== Study render ===== */
function renderStudy() {
  if (!dueList.length) {
    els.reviewBox.classList.add("hidden");
    els.empty.classList.remove("hidden");
    renderTodayProgress();
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

  els.cardBtn.classList.toggle("is-flipped", flipped);

  renderTodayProgress();
}

async function refreshSetSelectsByFolder() {
  const studyFolderId = els.studyFolderSelect.value || "all";
  const addFolderId = els.addFolderSelect.value || "all";
  const libFolderId = els.libFolderSelect.value || "all";

  const studySets = await getSetsByFolder(studyFolderId);
  const addSets = await getSetsByFolder(addFolderId);
  const libSets = await getSetsByFolder(libFolderId);

  // 保留原選擇（若仍存在）
  const keepStudySet = els.studySetSelect.value || "all";
  const keepAddSet = els.addSetSelect.value || (addSets[0]?.id ?? "all");
  const keepLibSet = els.libSetSelect.value || "all";

  fillSelect(els.studySetSelect, studySets, { includeAll: true, allLabel: "All Sets", selected: keepStudySet });
  fillSelect(els.addSetSelect, addSets, { includeAll: false, selected: keepAddSet });
  fillSelect(els.libSetSelect, libSets, { includeAll: true, allLabel: "All Sets", selected: keepLibSet });
}

async function loadDue({ useSavedSession = true } = {}) {
  const setId = els.studySetSelect.value || "all";
  await setMeta("activeStudySetId", setId);
  await setMeta("studyMode", els.modeSelect.value);

  dueList = await getDueWords(nowISO(), setId);

  // 今日計數：用 key 存
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

async function incTodayReviewed() {
  const k = `todayReviewed:${todayKey()}`;
  todayReviewed = (todayReviewed ?? 0) + 1;
  await setMeta(k, todayReviewed);
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

/** ===== Swipe (mobile) ===== */
function setupSwipe() {
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
    // 避免垂直捲動干擾
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

    // 門檻
    if (dx < -80) return rateCurrent(1);   // 左滑：不熟
    if (dx > 80)  return rateCurrent(3);   // 右滑：熟
  });

  els.cardBtn.addEventListener("pointercancel", () => {
    dragging = false;
    els.cardBtn.classList.remove("swipe-left", "swipe-right");
  });
}

/** ===== Add: Folder/Set & exam ===== */
async function createFolder() {
  const name = els.newFolderName.value.trim();
  if (!name) return;

  await addFolder({ id: uid(), name, createdAt: nowISO() });
  els.newFolderName.value = "";
  await hydrateSelectors();
}

async function createSet() {
  const folderId = els.addFolderSelect.value;
  const name = els.newSetName.value.trim();
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
  await hydrateSelectors(true);
}

async function saveExamForCurrentSet() {
  const setId = els.addSetSelect.value;
  if (!setId) return;

  // 直接用 update 的方式：這裡簡單做「重寫 set 物件」
  const all = await getAllSets();
  const s = all.find(x => x.id === setId);
  if (!s) return;

  s.examTitle = els.examTitle.value.trim();
  s.examDate = els.examDate.value; // yyyy-mm-dd
  await addSet(s);

  els.examMsg.textContent = "已儲存本單元考試資訊 ✅";
  setTimeout(() => (els.examMsg.textContent = ""), 1000);
}

async function addWordFromForm() {
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
  setTimeout(() => (els.addMsg.textContent = ""), 1000);

  await loadDue({ useSavedSession: false });
  await renderLibrary();
}

/** ===== Library (table + notebook) ===== */
let libView = "table"; // table | notebook

function setLibView(v) {
  libView = v;
  els.tableView.classList.toggle("hidden", v !== "table");
  els.notebookView.classList.toggle("hidden", v !== "notebook");
  els.viewTableBtn.classList.toggle("btn-soft", v === "table");
  els.viewTableBtn.classList.toggle("btn-ghost", v !== "table");
  els.viewNotebookBtn.classList.toggle("btn-soft", v === "notebook");
  els.viewNotebookBtn.classList.toggle("btn-ghost", v !== "notebook");
}

async function renderLibrary() {
  const setId = els.libSetSelect.value || "all";
  const q = els.libSearch.value.trim().toLowerCase();

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

  // Table
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

  // Notebook
  await renderNotebook();

  await refreshStats();
}

async function renderNotebook() {
  // Notebook：依「Folder / Set」顯示成單字薄（term/pos/中文）
  const folderId = els.libFolderSelect.value || "all";
  const setId = els.libSetSelect.value || "all";

  const folder = folders.find(f => f.id === folderId);
  const showingFolderName = folderId === "all" ? "All Folders" : (folder?.name ?? "Folder");
  const showingSetName = setId === "all" ? "All Sets" : (sets.find(s => s.id === setId)?.name ?? "Set");

  // 取 sets 範圍
  const scopedSets = (setId !== "all")
    ? sets.filter(s => s.id === setId)
    : (folderId === "all" ? sets : sets.filter(s => s.folderId === folderId));

  // 產生內容
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

/** ===== Backup ===== */
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

/** ===== hydration ===== */
async function hydrateSelectors(keepAddSetNew = false) {
  folders = (await getAllFolders()).sort((a,b) => a.name.localeCompare(b.name));
  sets = (await getAllSets()).sort((a,b) => a.name.localeCompare(b.name));

  // default selections
  const activeTab = (await getMeta("activeTab")) ?? "study";
  const studyFolder = (await getMeta("studyFolderId")) ?? "all";
  const libFolder = (await getMeta("libFolderId")) ?? "all";

  fillSelect(els.studyFolderSelect, folders, { includeAll:true, allLabel:"All Folders", selected: studyFolder });
  fillSelect(els.addFolderSelect, folders, { includeAll:false, selected: folders[0]?.id ?? "all" });
  fillSelect(els.libFolderSelect, folders, { includeAll:true, allLabel:"All Folders", selected: libFolder });

  await refreshSetSelectsByFolder();

  // mode restore
  const mode = (await getMeta("studyMode")) ?? "en2zh";
  els.modeSelect.value = mode;

  // apply lib view restore
  const lv = (await getMeta("libView")) ?? "table";
  setLibView(lv);

  // if just created set, keep it selected in add
  if (keepAddSetNew) {
    // nothing needed; addSetSelect already refreshed by folder
  }

  setActiveTab(activeTab);
}

/** ===== events ===== */
for (const t of els.tabs) {
  t.addEventListener("click", async () => {
    setActiveTab(t.dataset.tab);
    if (t.dataset.tab === "library") await renderLibrary();
  });
}

// Study filters
els.studyFolderSelect.addEventListener("change", async () => {
  await setMeta("studyFolderId", els.studyFolderSelect.value || "all");
  await refreshSetSelectsByFolder();
  idx = 0; flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: false });
});
els.studySetSelect.addEventListener("change", async () => {
  idx = 0; flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: false });
});
els.modeSelect.addEventListener("change", async () => {
  await setMeta("studyMode", els.modeSelect.value);
  flipped = false;
  await saveSession();
  renderStudy();
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

// Rate buttons
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
    await loadDue({ useSavedSession: false });
    return;
  }

  if (act === "edit") {
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
  await loadDue({ useSavedSession: false });

  setTimeout(() => (els.editMsg.textContent = ""), 900);
};

// Add: folder/set
els.createFolderBtn.onclick = createFolder;
els.addFolderSelect.addEventListener("change", async () => {
  await refreshSetSelectsByFolder();
});

els.createSetBtn.onclick = createSet;
els.addSetSelect.addEventListener("change", async () => {
  // 填回 set 的考試資訊
  const s = (await getAllSets()).find(x => x.id === els.addSetSelect.value);
  els.examTitle.value = s?.examTitle || "";
  els.examDate.value = s?.examDate || "";
});

els.saveExamBtn.onclick = saveExamForCurrentSet;
els.addBtn.onclick = addWordFromForm;

// Library filters
els.libFolderSelect.addEventListener("change", async () => {
  await setMeta("libFolderId", els.libFolderSelect.value || "all");
  await refreshSetSelectsByFolder();
  await renderLibrary();
});
els.libSetSelect.addEventListener("change", renderLibrary);
els.libSearch.addEventListener("input", () => {
  clearTimeout(window.__libT);
  window.__libT = setTimeout(renderLibrary, 120);
});
els.libRefreshBtn.onclick = renderLibrary;

els.viewTableBtn.onclick = async () => { setLibView("table"); await setMeta("libView", "table"); };
els.viewNotebookBtn.onclick = async () => { setLibView("notebook"); await setMeta("libView", "notebook"); await renderNotebook(); };
els.printNotebookBtn.onclick = () => { setLibView("notebook"); window.print(); };

// Backup
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
    await init();
    setTimeout(() => (els.backupMsg.textContent = ""), 1200);
  } catch {
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

/** ===== init ===== */
async function init() {
  await hydrateSelectors();

  // 預設：Study folder=all, set=all
  if (!els.studyFolderSelect.value) els.studyFolderSelect.value = "all";
  if (!els.studySetSelect.value) els.studySetSelect.value = "all";

  // Add 預設 set 的考試資訊
  const s = (await getAllSets()).find(x => x.id === els.addSetSelect.value);
  els.examTitle.value = s?.examTitle || "";
  els.examDate.value = s?.examDate || "";

  await refreshStats();
  await loadDue({ useSavedSession: true });
  await renderLibrary();
  setupSwipe();
}

await init();

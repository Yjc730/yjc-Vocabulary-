/* ===============================
   修正版 app.js（Study 穩定）
   =============================== */

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

/* ===== DOM refs（略，與你原本一致） ===== */
const els = { /* ⚠️ 此段保持你原本 */ };

/* ===== 狀態 ===== */
let folders = [];
let sets = [];
let dueList = [];
let idx = 0;
let flipped = false;
let todayReviewed = 0;
let libView = "table";

/* ===============================
   ✅ 修正 1：hydrateSelectors
   正確還原 studyFolderId
   =============================== */
async function hydrateSelectors() {
  folders = (await getAllFolders()).sort((a,b)=>a.name.localeCompare(b.name));
  sets = (await getAllSets()).sort((a,b)=>a.name.localeCompare(b.name));

  const activeTab = (await getMeta("activeTab")) ?? "home";
  const studyFolder = (await getMeta("studyFolderId")) ?? "all";
  const libFolder = (await getMeta("libFolderId")) ?? "all";

  fillSelect(els.studyFolderSelect, folders, {
    includeAll:true,
    allLabel:"All Folders",
    selected: studyFolder
  });

  fillSelect(els.addFolderSelect, folders, {
    includeAll:false,
    selected: folders[0]?.id ?? "all"
  });

  fillSelect(els.libFolderSelect, folders, {
    includeAll:true,
    allLabel:"All Folders",
    selected: libFolder
  });

  fillSelect(els.homeFolderSelect, folders, {
    includeAll:true,
    allLabel:"All Folders",
    selected:"all"
  });

  await refreshSetSelectsByFolder();

  const mode = (await getMeta("studyMode")) ?? "en2zh";
  els.modeSelect && (els.modeSelect.value = mode);

  const lv = (await getMeta("libView")) ?? "table";
  setLibView(lv);

  setActiveTab(activeTab);
}

/* ===============================
   ✅ 修正 2：Study Folder change
   一定存 meta + reload
   =============================== */
els.studyFolderSelect?.addEventListener("change", async () => {
  const fid = els.studyFolderSelect.value || "all";
  await setMeta("studyFolderId", fid);
  await refreshSetSelectsByFolder();
  idx = 0;
  flipped = false;
  await loadDue({ useSavedSession:false });
});

/* ===============================
   ✅ 修正 3：Home → Study
   一定 reload due
   =============================== */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-home-act]");
  if (!btn) return;

  const act = btn.dataset.homeAct;
  const setId = btn.dataset.set;

  if (els.studySetSelect) {
    els.studySetSelect.value = setId;
    await setMeta("activeStudySetId", setId);
  }

  idx = 0;
  flipped = false;

  if (act === "study") {
    setActiveTab("study");
    await loadDue({ useSavedSession:false });
  }

  if (act === "notebook") {
    setActiveTab("library");
    setLibView("notebook");
    els.libSetSelect && (els.libSetSelect.value = setId);
    await renderLibrary();
  }
});

/* ===============================
   ✅ 修正 4：today progress reset
   =============================== */
function renderTodayProgress() {
  const done = todayReviewed;
  const remain = dueList.length;
  const total = done + remain;
  const pct = total ? Math.round((done / total) * 100) : 0;

  els.todayText && (els.todayText.textContent = `今日進度：${done} / ${total}`);
  els.todayDoneText && (els.todayDoneText.textContent = `今日完成：${done}`);
  els.todayBar && (els.todayBar.style.width = `${pct}%`);
}

/* ===============================
   init（保持）
   =============================== */
async function init() {
  await hydrateSelectors();
  await refreshStats();
  await loadDue({ useSavedSession:true });
  await renderLibrary();
  await renderHomeCards();
  setupSwipe();
}

await init();

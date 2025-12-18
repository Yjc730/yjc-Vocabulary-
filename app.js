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

/* ===============================
   DOM refs（完整保留）
   =============================== */
const els = {
  stats: $("stats"),

  tabs: document.querySelectorAll(".tab"),
  panels: {
    home: $("tab-home"),
    study: $("tab-study"),
    add: $("tab-add"),
    library: $("tab-library"),
    backup: $("tab-backup"),
  },

  homeFolderSelect: $("homeFolderSelect"),
  homeSearch: $("homeSearch"),
  cardsWrap: $("cardsWrap"),

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

  exportBtn: $("exportBtn"),
  importFile: $("importFile"),
  importBtn: $("importBtn"),
  backupMsg: $("backupMsg"),
};

/* ===============================
   狀態
   =============================== */
let folders = [];
let sets = [];
let dueList = [];
let idx = 0;
let flipped = false;
let todayReviewed = 0;
let libView = "table";

/* ===============================
   hydrateSelectors（穩定版）
   =============================== */
async function hydrateSelectors() {
  folders = (await getAllFolders()).sort((a,b)=>a.name.localeCompare(b.name));
  sets = (await getAllSets()).sort((a,b)=>a.name.localeCompare(b.name));

  const activeTab = (await getMeta("activeTab")) ?? "home";
  const studyFolder = (await getMeta("studyFolderId")) ?? "all";
  const libFolder = (await getMeta("libFolderId")) ?? "all";

  fillSelect(els.studyFolderSelect, folders, {
    includeAll:true, allLabel:"All Folders", selected: studyFolder
  });
  fillSelect(els.addFolderSelect, folders, {
    includeAll:false, selected: folders[0]?.id ?? "all"
  });
  fillSelect(els.libFolderSelect, folders, {
    includeAll:true, allLabel:"All Folders", selected: libFolder
  });
  fillSelect(els.homeFolderSelect, folders, {
    includeAll:true, allLabel:"All Folders", selected:"all"
  });

  await refreshSetSelectsByFolder();

  els.modeSelect && (els.modeSelect.value = (await getMeta("studyMode")) ?? "en2zh");
  setLibView((await getMeta("libView")) ?? "table");
  setActiveTab(activeTab);
}

/* ===============================
   Study reload（保證 reload）
   =============================== */
async function reloadStudy() {
  idx = 0;
  flipped = false;
  await loadDue({ useSavedSession:false });
}

/* ===============================
   Events（關鍵）
   =============================== */
els.studyFolderSelect?.addEventListener("change", async () => {
  await setMeta("studyFolderId", els.studyFolderSelect.value || "all");
  await refreshSetSelectsByFolder();
  await reloadStudy();
});

els.studySetSelect?.addEventListener("change", reloadStudy);
els.reloadBtn?.addEventListener("click", reloadStudy);

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-home-act]");
  if (!btn) return;

  const setId = btn.dataset.set;
  els.studySetSelect && (els.studySetSelect.value = setId);
  idx = 0;
  flipped = false;

  if (btn.dataset.homeAct === "study") {
    setActiveTab("study");
    await reloadStudy();
  }
});

/* ===============================
   init
   =============================== */
async function init() {
  await hydrateSelectors();
  await loadDue({ useSavedSession:true });
  await renderLibrary();
  await renderHomeCards();
  setupSwipe();
}

await init();

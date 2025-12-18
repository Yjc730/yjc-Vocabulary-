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
    const opt = document.create

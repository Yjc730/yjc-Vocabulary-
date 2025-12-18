import { addWord, getDueWords, updateWord, setMeta, getMeta, getAllCount } from "./db.js";
import { nextSRSState } from "./srs.js";

const $ = (id) => document.getElementById(id);

const els = {
  term: $("term"), pos: $("pos"), definition: $("definition"), example: $("example"), tags: $("tags"),
  addBtn: $("addBtn"), addMsg: $("addMsg"),
  stats: $("stats"),
  reloadBtn: $("reloadBtn"),

  reviewBox: $("reviewBox"),
  empty: $("empty"),

  progressText: $("progressText"),
  cardBtn: $("cardBtn"),
  front: $("front"),
  sub: $("sub"),
  back: $("back"),
  exampleOut: $("exampleOut"),
  tagsOut: $("tagsOut"),
};

let dueList = [];
let idx = 0;
let flipped = false;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

function nowISO() {
  return new Date().toISOString();
}

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

async function refreshStats() {
  const total = await getAllCount();
  const due = (await getDueWords(nowISO())).length;
  els.stats.textContent = `總單字：${total}｜今日到期：${due}`;
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

function render() {
  if (!dueList.length) {
    els.reviewBox.classList.add("hidden");
    els.empty.classList.remove("hidden");
    return;
  }

  els.reviewBox.classList.remove("hidden");
  els.empty.classList.add("hidden");

  if (idx >= dueList.length) idx = 0;

  const w = dueList[idx];

  els.progressText.textContent = `${idx + 1} / ${dueList.length}`;

  els.front.textContent = w.term;
  els.sub.textContent = w.pos ? `${w.pos}` : "";

  els.back.textContent = w.definition || "";
  els.exampleOut.textContent = w.example ? `例句：${w.example}` : "";
  els.tagsOut.textContent = (w.tags && w.tags.length) ? `Tags：${w.tags.join(", ")}` : "";

  if (flipped) els.cardBtn.classList.add("is-flipped");
  else els.cardBtn.classList.remove("is-flipped");
}

async function loadDue({ useSavedSession = true } = {}) {
  dueList = await getDueWords(nowISO());

  if (!dueList.length) {
    idx = 0;
    flipped = false;
    await saveSession();
    render();
    await refreshStats();
    return;
  }

  if (useSavedSession) {
    await loadSession();
  }

  if (idx >= dueList.length) idx = 0;
  render();
  await refreshStats();
}

async function rateCurrent(score) {
  if (!dueList.length) return;

  const w = dueList[idx];
  const next = nextSRSState(w, score);
  await updateWord(w.id, next);

  flipped = false;

  // 更新後重新抓 due（因為這張卡會被排到未來，可能從清單消失）
  await loadDue({ useSavedSession: false });
  await saveSession();
}

els.addBtn.onclick = async () => {
  const term = els.term.value.trim();
  if (!term) return;

  const word = {
    id: uid(),
    term,
    pos: els.pos.value.trim(),
    definition: els.definition.value.trim(),
    example: els.example.value.trim(),
    tags: els.tags.value.split(",").map(s => s.trim()).filter(Boolean),

    repetitions: 0,
    intervalDays: 0,
    ease: 2.3,
    lastReviewedAt: null,
    dueAt: nowISO(),       // 新增後立刻可複習
    createdAt: nowISO(),
  };

  await addWord(word);

  els.addMsg.textContent = `已加入：${term}`;
  els.term.value = els.pos.value = els.definition.value = els.example.value = els.tags.value = "";
  await loadDue({ useSavedSession: true });

  setTimeout(() => (els.addMsg.textContent = ""), 1200);
};

els.cardBtn.onclick = async () => {
  flipped = !flipped;
  await saveSession();
  render();
};

els.reloadBtn.onclick = async () => {
  idx = 0;
  flipped = false;
  await saveSession();
  await loadDue({ useSavedSession: true });
};

// 點按評分
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".rate");
  if (!btn) return;
  const score = Number(btn.dataset.score);
  await rateCurrent(score);
});

// 快捷鍵：空白翻面｜1 還不熟(=1)｜2 我會了(=3)
document.addEventListener("keydown", async (e) => {
  if (isTyping()) return;

  if (e.key === " ") {
    e.preventDefault();
    flipped = !flipped;
    await saveSession();
    render();
    return;
  }
  if (e.key === "1") return rateCurrent(1);
  if (e.key === "2") return rateCurrent(3);

  // 額外：0/3 對應更多選項（可留著）
  if (e.key === "0") return rateCurrent(0);
  if (e.key === "3") return rateCurrent(2);
});

await loadDue({ useSavedSession: true });

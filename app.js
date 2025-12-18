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
  front: $("front"), sub: $("sub"),
  flipBtn: $("flipBtn"),
  backBox: $("backBox"),
  back: $("back"), exampleOut: $("exampleOut"), tagsOut: $("tagsOut"),
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

async function refreshStats() {
  const total = await getAllCount();
  const due = (await getDueWords(nowISO())).length;
  els.stats.textContent = `總單字：${total}｜今日到期：${due}`;
}

function render() {
  if (!dueList.length) {
    els.reviewBox.classList.add("hidden");
    els.empty.classList.remove("hidden");
    return;
  }
  els.reviewBox.classList.remove("hidden");
  els.empty.classList.add("hidden");

  const w = dueList[idx];
  els.front.textContent = w.term;
  els.sub.textContent = `${w.pos || ""} ${w.definition ? "— 先想意思再翻面" : ""}`.trim();

  els.back.textContent = w.definition || "";
  els.exampleOut.textContent = w.example ? `例句：${w.example}` : "";
  els.tagsOut.textContent = (w.tags && w.tags.length) ? `Tags：${w.tags.join(", ")}` : "";

  if (flipped) {
    els.backBox.classList.remove("hidden");
    els.flipBtn.classList.add("hidden");
  } else {
    els.backBox.classList.add("hidden");
    els.flipBtn.classList.remove("hidden");
  }
}

async function saveSession() {
  await setMeta("lastSession", { idx, flipped, ts: nowISO() });
}

async function loadSession() {
  const s = await getMeta("lastSession");
  if (!s) return;
  // 如果今天到期清單變了，idx 可能超出，render 時會修正
  idx = Number.isFinite(s.idx) ? s.idx : 0;
  flipped = !!s.flipped;
}

async function loadDue() {
  dueList = await getDueWords(nowISO());
  if (!dueList.length) {
    idx = 0;
    flipped = false;
    await saveSession();
    render();
    await refreshStats();
    return;
  }

  await loadSession();
  if (idx >= dueList.length) idx = 0; // 防呆
  render();
  await refreshStats();
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

    // 初始 SRS：今天就到期（新增後可立刻複習）
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
  await loadDue();
  setTimeout(() => (els.addMsg.textContent = ""), 1200);
};

els.flipBtn.onclick = async () => {
  flipped = true;
  await saveSession();
  render();
};

els.reloadBtn.onclick = async () => {
  idx = 0;
  flipped = false;
  await setMeta("lastSession", { idx, flipped, ts: nowISO() });
  await loadDue();
};

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".rate");
  if (!btn) return;

  const score = Number(btn.dataset.score);
  const w = dueList[idx];
  const next = nextSRSState(w, score);

  await updateWord(w.id, next);

  // 下一張
  flipped = false;
  // 重新取 today due（因為剛剛那張可能被排到未來）
  await loadDue();

  // 如果 dueList 還有，保持 idx 不變（等於「吃掉當前卡」）
  // 因為 loadDue 會用 lastSession 的 idx，所以我們手動保存最新 idx
  await setMeta("lastSession", { idx: Math.min(idx, Math.max(0, dueList.length - 1)), flipped, ts: nowISO() });
});

await loadDue();

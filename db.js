const DB_NAME = "vocab_srs_db";
const DB_VER = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = () => {
      const db = req.result;

      // words store
      let words;
      if (!db.objectStoreNames.contains("words")) {
        words = db.createObjectStore("words", { keyPath: "id" });
      } else {
        words = req.transaction.objectStore("words");
      }

      // ensure indexes
      if (!words.indexNames.contains("dueAt")) words.createIndex("dueAt", "dueAt");
      if (!words.indexNames.contains("term")) words.createIndex("term", "term");
      if (!words.indexNames.contains("setId")) words.createIndex("setId", "setId");

      // sets store
      if (!db.objectStoreNames.contains("sets")) {
        const sets = db.createObjectStore("sets", { keyPath: "id" });
        sets.createIndex("name", "name");
      }

      // meta store
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(db, name, mode = "readonly") {
  return db.transaction(name, mode).objectStore(name);
}

export async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "meta", "readwrite");
    const req = s.put({ key, value });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "meta");
    const req = s.get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Sets */
export async function addSet(setObj) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "sets", "readwrite");
    const req = s.put(setObj);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "sets");
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Words */
export async function addWord(word) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "words", "readwrite");
    const req = s.put(word);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function updateWord(id, patch) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "words", "readwrite");
    const getReq = s.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result;
      if (!cur) return resolve(false);
      const next = { ...cur, ...patch };
      const putReq = s.put(next);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteWord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "words", "readwrite");
    const req = s.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const s = store(db, "words");
    const req = s.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

export async function getDueWords(nowISO, setIdOrAll = "all") {
  const db = await openDB();
  const wordsStore = store(db, "words");
  const dueIdx = wordsStore.index("dueAt");
  const range = IDBKeyRange.upperBound(nowISO);

  const allDue = await new Promise((resolve, reject) => {
    const req = dueIdx.getAll(range);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  if (setIdOrAll === "all") return allDue;
  return allDue.filter(w => w.setId === setIdOrAll);
}

export async function getWordsBySet(setIdOrAll = "all") {
  const db = await openDB();
  const s = store(db, "words");
  if (setIdOrAll === "all") {
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  const idx = s.index("setId");
  const range = IDBKeyRange.only(setIdOrAll);
  return new Promise((resolve, reject) => {
    const req = idx.getAll(range);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Backup */
export async function exportAll() {
  const db = await openDB();
  const sets = await new Promise((resolve, reject) => {
    const req = store(db, "sets").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const words = await new Promise((resolve, reject) => {
    const req = store(db, "words").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const meta = await new Promise((resolve, reject) => {
    const req = store(db, "meta").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sets,
    words,
    meta,
  };
}

export async function importAll(payload) {
  const db = await openDB();
  const tx = db.transaction(["sets", "words", "meta"], "readwrite");
  const setsStore = tx.objectStore("sets");
  const wordsStore = tx.objectStore("words");
  const metaStore = tx.objectStore("meta");

  const sets = Array.isArray(payload?.sets) ? payload.sets : [];
  const words = Array.isArray(payload?.words) ? payload.words : [];
  const meta = Array.isArray(payload?.meta) ? payload.meta : [];

  // upsert sets/words/meta
  for (const s of sets) setsStore.put(s);
  for (const w of words) wordsStore.put(w);
  for (const m of meta) metaStore.put(m);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

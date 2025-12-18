const DB_NAME = "vocab_srs_db";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;

      // 單字表：內容 + SRS 狀態
      if (!db.objectStoreNames.contains("words")) {
        const store = db.createObjectStore("words", { keyPath: "id" });
        store.createIndex("dueAt", "dueAt");
        store.createIndex("term", "term");
      }

      // app 狀態：記住上次做到哪、是否翻面…
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function addWord(word) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "words", "readwrite");
    const req = store.put(word);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getDueWords(nowISO) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "words");
    const idx = store.index("dueAt");
    const range = IDBKeyRange.upperBound(nowISO);
    const req = idx.getAll(range);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "words");
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

export async function updateWord(id, patch) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "words", "readwrite");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result;
      if (!cur) return resolve(false);
      const next = { ...cur, ...patch };
      const putReq = store.put(next);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "meta", "readwrite");
    const req = store.put({ key, value });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "meta");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

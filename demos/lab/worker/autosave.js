// One local sheet. Transaction completion, not request success, means it is saved.
let database;
function open() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('paint-lab', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sheets');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savedSheet() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('sheets').objectStore('sheets').get('current');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function saveSheet(bytes) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sheets', 'readwrite');
    tx.objectStore('sheets').put({ bytes, savedAt: Date.now() }, 'current');
    tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

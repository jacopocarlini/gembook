import Dexie from 'dexie';

export const db = new Dexie('eReaderDB');
db.version(1).stores({
    books: '++id, title, progress, currentCfi'
    // 'file' (ArrayBuffer) e 'cover' (Blob/URL) saranno salvati ma non serve indicizzarli
});
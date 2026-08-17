/**
 * 아주 얇은 IndexedDB 래퍼.
 *
 * MVP 단계에서는 수업자료를 브라우저에 저장한다. 서버(Firebase Storage 등)를
 * 붙이는 시점에는 이 파일이 아니라 lib/materials.ts 의 함수 구현만 갈아끼우면 된다.
 */

const DB_NAME = 'chicode'
const DB_VERSION = 1

export const STORE_MATERIALS = 'materials'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_MATERIALS)) {
        const store = db.createObjectStore(STORE_MATERIALS, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = run(tx.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function dbGetAll<T>(storeName: string): Promise<T[]> {
  return withStore<T[]>(storeName, 'readonly', (store) => store.getAll())
}

export function dbGet<T>(storeName: string, id: string): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, 'readonly', (store) => store.get(id))
}

export function dbPut<T>(storeName: string, value: T): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(storeName, 'readwrite', (store) => store.put(value))
}

export function dbDelete(storeName: string, id: string): Promise<undefined> {
  return withStore<undefined>(storeName, 'readwrite', (store) => store.delete(id))
}

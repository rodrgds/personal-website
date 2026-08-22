export function getStoredJSON<T>(key: string, fallback: T): T {
  // localStorage is undefined during SSR; only the browser path stores data.
  if (!("localStorage" in globalThis)) return fallback;

  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    // SAFETY: callers own the storage key and pass the matching type; a stale
    // or corrupt payload falls back through the catch below.
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setStoredJSON<T>(key: string, value: T): void {
  // See getStoredJSON: this helper is browser-only by contract.
  if (!("localStorage" in globalThis)) return;
  localStorage.setItem(key, JSON.stringify(value));
}

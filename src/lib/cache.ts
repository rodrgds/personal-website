interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly durationMs: number,
    private readonly maxEntries = 50,
  ) {}

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.durationMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }

    this.cache.delete(key);
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async getOrSet(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const pending = loader()
      .then((data) => {
        this.set(key, data);
        return data;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, pending);
    return pending;
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}

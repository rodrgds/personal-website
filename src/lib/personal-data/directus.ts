const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 100;
const READ_BATCH_SIZE = 100;

interface DirectusEnvelope<T> {
  data: T;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
}

interface DirectusRequestOptions extends RequestInit {
  query?: Record<string, string | number | boolean | object | undefined>;
  retries?: number;
}

export interface UpsertResult {
  created: number;
  updated: number;
  skipped: number;
}

function readEnv(name: string): string | undefined {
  return (
    process.env[name] ??
    (import.meta.env as Record<string, string | undefined>)[name]
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !["date_created", "date_updated"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function comparableItem(item: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(item));
}

export class DirectusError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DirectusError";
  }
}

export class PersonalDataDirectus {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request<T>(
    path: string,
    options: DirectusRequestOptions = {},
  ): Promise<T> {
    const { query, retries = 2, headers, ...init } = options;
    const url = new URL(`${this.baseUrl}${path}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.token}`,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        const body = (await response
          .json()
          .catch(() => null)) as DirectusEnvelope<T> | null;
        if (response.ok) return body?.data as T;

        const message =
          body?.errors?.[0]?.message ??
          `Directus request failed with status ${response.status}`;
        const error = new DirectusError(
          message,
          response.status,
          body?.errors?.[0]?.extensions?.code,
        );

        if (
          attempt < retries &&
          (response.status === 429 || response.status >= 500)
        ) {
          await delay(250 * 2 ** attempt);
          lastError = error;
          continue;
        }
        throw error;
      } catch (error) {
        lastError = error;
        if (
          attempt < retries &&
          (!(error instanceof DirectusError) || error.status >= 500)
        ) {
          await delay(250 * 2 ** attempt);
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  async readAll<T extends Record<string, unknown>>(
    collection: string,
    options: {
      fields?: string[];
      filter?: object;
      sort?: string[];
      limit?: number;
    } = {},
  ): Promise<T[]> {
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const rows: T[] = [];
    let page = 1;

    while (true) {
      const batch = await this.request<T[]>(`/items/${collection}`, {
        query: {
          fields: options.fields?.join(","),
          filter: options.filter,
          sort: options.sort?.join(","),
          limit,
          page,
        },
      });
      rows.push(...batch);
      if (batch.length < limit) return rows;
      page += 1;
    }
  }

  async readOne<T extends Record<string, unknown>>(
    collection: string,
    id: string,
    fields?: string[],
  ): Promise<T | null> {
    const rows = await this.request<T[]>(`/items/${collection}`, {
      query: {
        fields: fields?.join(","),
        filter: { id: { _eq: id } },
        limit: 1,
      },
    });
    return rows[0] ?? null;
  }

  async createMany(
    collection: string,
    items: Array<Record<string, unknown>>,
  ): Promise<void> {
    for (const batch of chunk(items, WRITE_BATCH_SIZE)) {
      await this.request(`/items/${collection}`, {
        method: "POST",
        body: JSON.stringify(batch),
      });
    }
  }

  async updateMany(
    collection: string,
    items: Array<Record<string, unknown>>,
  ): Promise<void> {
    for (const batch of chunk(items, WRITE_BATCH_SIZE)) {
      await this.request(`/items/${collection}`, {
        method: "PATCH",
        body: JSON.stringify(batch),
      });
    }
  }

  async updateOne(
    collection: string,
    id: string,
    item: Record<string, unknown>,
  ): Promise<void> {
    await this.request(`/items/${collection}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(item),
    });
  }

  async deleteOne(collection: string, id: string): Promise<void> {
    await this.request(`/items/${collection}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async deleteMany(collection: string, ids: string[]): Promise<void> {
    for (const batch of chunk(ids, WRITE_BATCH_SIZE)) {
      await this.request(`/items/${collection}`, {
        method: "DELETE",
        body: JSON.stringify(batch),
      });
    }
  }

  async upsertMany(
    collection: string,
    items: Array<Record<string, unknown> & { id: string }>,
    immutable = false,
  ): Promise<UpsertResult> {
    if (items.length === 0) return { created: 0, updated: 0, skipped: 0 };

    const existing = new Map<string, Record<string, unknown>>();
    for (const ids of chunk(
      items.map((item) => item.id),
      READ_BATCH_SIZE,
    )) {
      const rows = await this.readAll<Record<string, unknown>>(collection, {
        filter: { id: { _in: ids } },
        limit: READ_BATCH_SIZE,
      });
      for (const row of rows) existing.set(String(row.id), row);
    }

    const creates: typeof items = [];
    const updates: typeof items = [];
    let skipped = 0;

    for (const item of items) {
      const current = existing.get(item.id);
      if (!current) {
        creates.push(item);
      } else if (
        immutable ||
        comparableItem(current) === comparableItem(item)
      ) {
        skipped += 1;
      } else {
        updates.push(item);
      }
    }

    await this.createMany(collection, creates);
    await this.updateMany(collection, updates);

    return { created: creates.length, updated: updates.length, skipped };
  }
}

export function getPersonalDataDirectus(): PersonalDataDirectus {
  const baseUrl =
    readEnv("DIRECTUS_INTERNAL_URL") ?? readEnv("DIRECTUS_URL") ?? "";
  const token = readEnv("DIRECTUS_ACCESS_TOKEN") ?? "";

  if (!baseUrl || !token) {
    throw new Error("Directus personal-data connection is not configured");
  }

  return new PersonalDataDirectus(baseUrl, token);
}

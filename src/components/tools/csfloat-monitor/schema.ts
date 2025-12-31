import { writable, type Writable } from "svelte/store";

// Cache stores
export const rarities: Writable<Record<string, any>> = writable({});
export const qualities: Writable<Record<string, string>> = writable({});
export const paints: Writable<Record<string, any>> = writable({});
export const definitions: Writable<Record<string, any>> = writable({});
export const items: Writable<Record<string, any>> = writable({});

let fetched = false;

const URLS = {
  rarities:
    "https://raw.githubusercontent.com/somespecialone/cs2-items-schema/refs/heads/master/schemas/rarities.json",
  qualities:
    "https://raw.githubusercontent.com/somespecialone/cs2-items-schema/refs/heads/master/schemas/qualities.json",
  paints:
    "https://raw.githubusercontent.com/somespecialone/cs2-items-schema/refs/heads/master/schemas/paints.json",
  definitions:
    "https://raw.githubusercontent.com/somespecialone/cs2-items-schema/refs/heads/master/schemas/definitions.json",
  items:
    "https://raw.githubusercontent.com/somespecialone/cs2-items-schema/refs/heads/master/schemas/items.json",
};



export async function fetchSchemas() {
  if (fetched) return;

  try {
    const [r, q, p, d, i] = await Promise.all([
      fetch(URLS.rarities).then((res) => res.json()),
      fetch(URLS.qualities).then((res) => res.json()),
      fetch(URLS.paints).then((res) => res.json()),
      fetch(URLS.definitions).then((res) => res.json()),
      fetch(URLS.items).then((res) => res.json()),
    ]);

    rarities.set(r);
    qualities.set(q);
    paints.set(p);
    definitions.set(d);
    items.set(i);

    fetched = true;
    console.log("CSFloat Monitor: Schemas fetched successfully");
  } catch (e) {
    console.error("CSFloat Monitor: Failed to fetch schemas", e);
  }
}

import { SimpleCache } from "../lib/cache";

export const hevyDataCache = new SimpleCache<unknown>(3 * 60 * 60 * 1000, 2);
export const lastfmDataCache = new SimpleCache<unknown>(30 * 60 * 1000, 5);

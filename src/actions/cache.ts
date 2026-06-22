import { SimpleCache } from "../lib/cache";

export const hevyDataCache = new SimpleCache<any>(3 * 60 * 60 * 1000);
export const lastfmDataCache = new SimpleCache<any>(30 * 60 * 1000);
export const traktDataCache = new SimpleCache<any>(60 * 60 * 1000);

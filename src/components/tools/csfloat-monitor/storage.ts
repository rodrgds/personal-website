import { writable } from "svelte/store";
import { type MonitorSettings, DEFAULT_SETTINGS } from "./types";
import { getStoredJSON, setStoredJSON } from "../../../lib/client-storage";

const STORAGE_KEY = "csfloat_monitor_settings";
const STORAGE_VERSION_KEY = `${STORAGE_KEY}_version`;
const STORAGE_VERSION = "2";
type StoredSettings = Omit<MonitorSettings, "apiKey">;

function persistSettings(value: MonitorSettings): void {
  const { apiKey: _apiKey, ...safeSettings } = value;
  setStoredJSON<StoredSettings>(STORAGE_KEY, safeSettings);
  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
}

function createSettingsStore() {
  const { subscribe, set, update } =
    writable<MonitorSettings>(DEFAULT_SETTINGS);

  return {
    subscribe,
    set: (value: MonitorSettings) => {
      persistSettings(value);
      set(value);
    },
    update: (updater: (value: MonitorSettings) => MonitorSettings) => {
      update((current) => {
        const next = updater(current);
        persistSettings(next);
        return next;
      });
    },
    load: () => {
      if (localStorage.getItem(STORAGE_VERSION_KEY) !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      }
      const stored = getStoredJSON<Partial<StoredSettings>>(STORAGE_KEY, {});
      set({ ...DEFAULT_SETTINGS, ...stored, apiKey: "" });
    },
    reset: () => {
      set(DEFAULT_SETTINGS);
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      }
    },
  };
}

export const settings = createSettingsStore();

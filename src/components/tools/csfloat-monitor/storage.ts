import { writable } from "svelte/store";
import { type MonitorSettings, DEFAULT_SETTINGS } from "./types";

const STORAGE_KEY = "csfloat_monitor_settings";

function createSettingsStore() {
  // Initialize with defaults
  const { subscribe, set, update } =
    writable<MonitorSettings>(DEFAULT_SETTINGS);

  return {
    subscribe,
    set: (value: MonitorSettings) => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }
      set(value);
    },
    update,
    load: () => {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            set({ ...DEFAULT_SETTINGS, ...parsed }); // Merge with defaults to handle new fields
          } catch (e) {
            console.error("Failed to parse settings", e);
          }
        }
      }
    },
    reset: () => {
      set(DEFAULT_SETTINGS);
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
  };
}

export const settings = createSettingsStore();

import { writable } from "svelte/store";
import { type MonitorSettings, DEFAULT_SETTINGS } from "./types";
import { getStoredJSON, setStoredJSON } from "../../../lib/client-storage";

const STORAGE_KEY = "csfloat_monitor_settings";

function createSettingsStore() {
  const { subscribe, set, update } =
    writable<MonitorSettings>(DEFAULT_SETTINGS);

  return {
    subscribe,
    set: (value: MonitorSettings) => {
      setStoredJSON(STORAGE_KEY, value);
      set(value);
    },
    update,
    load: () => {
      const stored = getStoredJSON(STORAGE_KEY, DEFAULT_SETTINGS);
      set({ ...DEFAULT_SETTINGS, ...stored });
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

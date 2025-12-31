export interface Item {
  market_hash_name: string;
  float_value?: number;
  paint_seed?: number;
  icon_url?: string;
  inspect_link?: string;
}

export interface Reference {
  base_price?: number;
  predicted_price?: number;
  quantity?: number;
  last_updated?: string;
}

export interface Listing {
  id: string;
  created_at: string;
  price: number;
  type: "buy_now" | "auction";
  item: Item;
  reference?: Reference;
  is_seller?: boolean;
  seller?: {
    avatar?: string;
    username?: string;
    online?: boolean;
  };
}

export interface MonitorSettings {
  apiKey: string;
  // network
  proxyUrl: string;

  // filters
  minPrice: number;
  maxPrice: number;

  // notifications
  enableBrowserNotifications: boolean;
  enableNtfyNotifications: boolean;
  ntfyServer: string;
  ntfyTopic: string;

  // performance
  limit: number;
  baseInterval: number;

  // discount logic
  minDiscountPercent: number; // For simpler logic if needed, or base param
  minDiscountAbs: number;
  dynDiscountMinPercent: number;
  dynDiscountMaxPercent: number;
  dynDiscountBasePrice: number;

  sortBy: "most_recent" | "lowest_price" | "highest_price" | "highest_discount";
}

export const DEFAULT_SETTINGS: MonitorSettings = {
  apiKey: "",
  proxyUrl: "https://corsproxy.io/?",

  minPrice: 500,
  maxPrice: 100000,

  enableBrowserNotifications: true,
  enableNtfyNotifications: false,
  ntfyServer: "https://ntfy.sh",
  ntfyTopic: "csfloat-monitor",

  limit: 30,
  baseInterval: 20,

  minDiscountPercent: 0.1,
  minDiscountAbs: 20.0,
  dynDiscountMinPercent: 0.03,
  dynDiscountMaxPercent: 0.1,
  dynDiscountBasePrice: 10.0,

  sortBy: "most_recent",
};

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: "info" | "success" | "error" | "warning";
  link?: string;
  isCheck?: boolean;
  overlaps?: number;
}

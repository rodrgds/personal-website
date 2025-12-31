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
  proxyUrls: string[];

  // filters
  minPrice: number;
  maxPrice: number;
  category: number;
  rarity: number;
  defIndex: number;
  paintIndex: number;
  paintSeed: number;
  minFloat: number;
  maxFloat: number;
  minBlue: number;
  maxBlue: number;
  minFade: number;
  maxFade: number;
  minRefQty: number;
  userId: string;
  marketHashName: string;
  type: "buy_now" | "auction" | "any";

  // notifications
  enableBrowserNotifications: boolean;
  enableNtfyNotifications: boolean;
  ntfyServer: string;
  ntfyTopic: string;

  // performance
  limit: number;
  baseInterval: number;

  // discount logic
  enableDiscountChecking: boolean;
  useSingleDiscount: boolean;
  singleDiscountPercent: number;
  minDiscountPercent: number; // For simpler logic if needed, or base param
  minDiscountAbs: number;
  dynDiscountMinPercent: number;
  dynDiscountMaxPercent: number;
  dynDiscountBasePrice: number;

  sortBy: "most_recent" | "lowest_price" | "highest_price" | "highest_discount";
}

export const DEFAULT_SETTINGS: MonitorSettings = {
  apiKey: "",
  proxyUrls: ["https://corsproxy.io/?"],

  minPrice: 500,
  maxPrice: 100000,

  // New Filters
  category: 0,
  rarity: -1,
  defIndex: -1,
  paintIndex: -1,
  paintSeed: -1,
  minFloat: 0,
  maxFloat: 1,
  minBlue: 0,
  maxBlue: 100,
  minFade: 80,
  maxFade: 100,
  minRefQty: 0,
  userId: "",
  marketHashName: "",
  type: "buy_now",

  enableBrowserNotifications: true,
  enableNtfyNotifications: false,
  ntfyServer: "https://ntfy.sh",
  ntfyTopic: "csfloat-monitor",

  limit: 30,
  baseInterval: 20,

  enableDiscountChecking: true,
  useSingleDiscount: false,
  singleDiscountPercent: 5.0,
  minDiscountPercent: 10.0,
  minDiscountAbs: 20.0,
  dynDiscountMinPercent: 5.0,
  dynDiscountMaxPercent: 10.0,
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
  limit?: number;
}

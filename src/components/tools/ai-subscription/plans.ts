export type PlanId =
  | "chatgpt-plus"
  | "claude-pro"
  | "opencode-go"
  | "google-ai-pro"
  | "x-premium";

export interface AiPlan {
  id: PlanId;
  name: string;
  price: string;
  /** One line. The whole argument for the plan. */
  why: string;
  /** Vendor's own pricing page. */
  url: string;
}

/**
 * Prices are the vendor's own, in the currency they bill Portugal in.
 * Google publishes a euro price for Portugal; the others bill USD.
 */
export const PLANS: readonly AiPlan[] = [
  {
    id: "chatgpt-plus",
    name: "ChatGPT Plus",
    price: "$20/mo",
    why: "One plan that does everything, and the most usage of the $20 options.",
    url: "https://chatgpt.com/pricing/",
  },
  {
    id: "claude-pro",
    name: "Claude Pro",
    price: "$20/mo",
    why: "The sharpest model for hard code.",
    url: "https://claude.com/pricing",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    price: "$10/mo",
    why: "Coding only, no chat app, and half the price.",
    url: "https://opencode.ai/docs/go/",
  },
  {
    id: "google-ai-pro",
    name: "Google AI Pro",
    price: "\u20ac21.99/mo",
    why: "5 TB of storage, with Gemini across Gmail and Docs.",
    url: "https://gemini.google/pt/subscriptions/?hl=pt-PT",
  },
  {
    id: "x-premium",
    name: "X Premium",
    price: "$8/mo",
    why: "Buy it for X, not for AI.",
    url: "https://help.x.com/en/using-x/x-premium",
  },
];

export function planById(id: PlanId): AiPlan {
  const match = PLANS.find((plan) => plan.id === id);
  if (!match) throw new Error(`Unknown plan: ${id}`);
  return match;
}

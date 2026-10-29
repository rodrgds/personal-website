export type PlanId =
  | "chatgpt-plus"
  | "claude-pro"
  | "opencode-go"
  | "google-ai-pro";

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
    why: "Chat, coding, images and voice in one subscription.",
    url: "https://chatgpt.com/pricing/",
  },
  {
    id: "claude-pro",
    name: "Claude Pro",
    price: "$20/mo",
    why: "Claude for writing and coding, with shared usage limits.",
    url: "https://claude.com/pricing",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    price: "$10/mo",
    why: "More coding usage with a selection of cheaper models.",
    url: "https://opencode.ai/docs/go/",
  },
  {
    id: "google-ai-pro",
    name: "Google AI Pro",
    price: "\u20ac21.99/mo",
    why: "Gemini in Gmail and Drive, plus cloud storage.",
    url: "https://gemini.google/pt/subscriptions/?hl=pt-PT",
  },
];

export function planById(id: PlanId): AiPlan {
  const match = PLANS.find((plan) => plan.id === id);
  if (!match) throw new Error(`Unknown plan: ${id}`);
  return match;
}

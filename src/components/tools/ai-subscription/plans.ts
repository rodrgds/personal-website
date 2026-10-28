export type PlanId =
  | "claude-pro"
  | "chatgpt-plus"
  | "opencode-go"
  | "google-ai-pro"
  | "x-premium";

export interface AiPlan {
  id: PlanId;
  name: string;
  price: string;
  headline: string;
  why: readonly string[];
  watchOut: string;
  url: string;
  /** True when the honest answer is "do not buy this as an AI plan". */
  skip: boolean;
  alternate: PlanId;
}

/**
 * Prices come from each vendor's own pricing page, in USD, which is the frame
 * this page is written in. In Portugal the same plans bill in euros and land
 * near the same number with VAT.
 */
export const PLANS: readonly AiPlan[] = [
  {
    id: "claude-pro",
    name: "Claude Pro",
    price: "$20/mo",
    headline: "The best code, and enough of it.",
    why: [
      "Anthropic still writes the code I trust most.",
      "Base usage across the top two models is a little better than ChatGPT's, when nobody is handing out resets.",
    ],
    watchOut:
      "Web, desktop, mobile and Claude Code all draw from one pool, so it runs out faster than people expect.",
    url: "https://claude.com/pricing",
    skip: false,
    alternate: "chatgpt-plus",
  },
  {
    id: "chatgpt-plus",
    name: "ChatGPT Plus",
    price: "$20/mo",
    headline: "The most total usage, plus image generation.",
    why: [
      "Chat limits and Codex limits are separate, so one $20 plan behaves like two.",
      "Image generation is good enough to be a reason on its own.",
      "Right now the resets make it the most usage per dollar of the five.",
    ],
    watchOut: "A little behind Claude on hard code.",
    url: "https://chatgpt.com/pricing/",
    skip: false,
    alternate: "claude-pro",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    price: "$10/mo",
    headline: "Half the price, far more usage.",
    why: [
      "Each model carries its own monthly allowance, so the cheap ones stretch a long way.",
      "Good enough for a side project, a learning sprint, or anyone who does not need the smartest model on every prompt.",
    ],
    watchOut: "Third-party models, and no chat app of its own.",
    url: "https://opencode.ai/docs/go/",
    skip: false,
    alternate: "chatgpt-plus",
  },
  {
    id: "google-ai-pro",
    name: "Google AI Pro",
    price: "$20/mo",
    headline: "You are buying the storage, the assistant comes with it.",
    why: [
      "5 TB across Gmail, Drive and Photos. If you already pay for storage, the AI costs nothing extra.",
      "Gemini sits inside Gmail, Docs and the rest, which beats one more separate app if you live in Google.",
    ],
    watchOut: "The models are not the reason to buy it.",
    url: "https://gemini.google/pt/subscriptions/?hl=pt-PT",
    skip: false,
    alternate: "chatgpt-plus",
  },
  {
    id: "x-premium",
    name: "X Premium",
    price: "$8/mo",
    headline: "Buy it for X, not for AI.",
    why: [
      "You get a little Grok and a little Cursor, not enough to change how you work.",
      "The tier that is actually about AI is Premium+, and at $40 it is outside this budget and still behind the $20 plans.",
    ],
    watchOut: "I would not recommend it as an AI subscription to anyone.",
    url: "https://help.x.com/en/using-x/x-premium",
    skip: true,
    alternate: "opencode-go",
  },
];

export function planById(id: PlanId): AiPlan {
  const match = PLANS.find((plan) => plan.id === id);
  if (!match) throw new Error(`Unknown plan: ${id}`);
  return match;
}

export type PlanId =
  | "claude-pro"
  | "chatgpt-plus"
  | "opencode-go"
  | "google-ai-pro"
  | "x-premium";

export interface AiPlan {
  id: PlanId;
  name: string;
  vendor: string;
  price: string;
  priceNote: string;
  headline: string;
  why: readonly string[];
  watchOut: string;
  url: string;
  skip: boolean;
  alternate: PlanId;
}

/**
 * Prices were checked by hand against each vendor's own pricing page.
 * Editing this file plus LAST_CHECKED in flow.ts is the whole update.
 */
export const PLANS: readonly AiPlan[] = [
  {
    id: "claude-pro",
    name: "Claude Pro",
    vendor: "Anthropic",
    price: "$20/month",
    priceNote: "$17/month if you pay for a year up front ($200).",
    headline: "The best models for code, and a fair amount of them.",
    why: [
      "For $20 this is the strongest thing you can buy for code. The top Anthropic models still write the code I trust most.",
      "Base usage across the two best models is a little higher than ChatGPT Plus, when neither one is being reset.",
      "One subscription covers Claude in the browser, on your phone, and Claude Code in a terminal.",
    ],
    watchOut:
      "Usage is tighter than people expect. There is a rolling five-hour window plus a weekly cap, and web, desktop, mobile and Claude Code all draw from the same pool.",
    url: "https://claude.com/pricing",
    skip: false,
    alternate: "chatgpt-plus",
  },
  {
    id: "chatgpt-plus",
    name: "ChatGPT Plus",
    vendor: "OpenAI",
    price: "$20/month",
    priceNote: "ChatGPT Go is $8/month if you want a cheaper tier.",
    headline:
      "The most total usage, plus image generation that is actually good.",
    why: [
      "Chat limits and Codex limits are separate, so one $20 plan behaves like two subscriptions. That is the real reason to pick it.",
      "Image generation is the best of the five and it is included, not metered down to nothing.",
      "Right now it also keeps getting resets on top of that, so the amount of work you get per month is the highest here.",
    ],
    watchOut:
      "Quality per answer is slightly behind Claude on hard code. If you want the single best model rather than the most usage, pick Claude.",
    url: "https://chatgpt.com/pricing/",
    skip: false,
    alternate: "claude-pro",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    vendor: "OpenCode",
    price: "$10/month",
    priceNote: "Go Plus is $40/month if you outgrow it.",
    headline: "Half the price, a lot more usage, models that are good enough.",
    why: [
      "Each model carries its own monthly allowance. DeepSeek V4.1 Flash runs at $0.15/$0.60 per million tokens with an $80 monthly allowance, which is hard to match on raw API keys.",
      "It is the honest answer for a side project, a learning sprint, or anyone who does not need the smartest model on every prompt.",
      "Saving $10 a month beats a small jump in model quality for most people reading this.",
    ],
    watchOut:
      "You pick from a menu of third-party models instead of one flagship, and there is no first-party chat app included.",
    url: "https://opencode.ai/docs/go/",
    skip: false,
    alternate: "chatgpt-plus",
  },
  {
    id: "google-ai-pro",
    name: "Google AI Pro",
    vendor: "Google",
    price: "€21.99/month in Portugal",
    priceNote:
      "$19.99/month in the US. Google AI Plus is the cheaper tier: €4.99/month here with 400 GB instead of 5 TB.",
    headline: "Buy the storage, get the assistant thrown in.",
    why: [
      "5 TB across Gmail, Drive and Photos. If you already pay for storage, the AI part effectively costs nothing on top.",
      "Gemini sits inside Gmail, Docs and the rest of Workspace, which is worth more than one more separate app if you already live in Google products.",
      "Usage limits are four times the free tier, so it is not a token gesture.",
    ],
    watchOut:
      "The models are good but they are not the reason to buy this. If you do not need the storage or the Workspace integration, the money goes further elsewhere.",
    url: "https://gemini.google/pt/subscriptions/?hl=pt-PT",
    skip: false,
    alternate: "chatgpt-plus",
  },
  {
    id: "x-premium",
    name: "X Premium",
    vendor: "X",
    price: "$8/month in the US, €8/month in Portugal",
    priceNote: "Basic is $3/month. Premium+ is $40/month in the US, €38 here.",
    headline: "Buy it for X, not for AI.",
    why: [
      "You do get a little Grok and a little Cursor access, but so little that it will not change how you work.",
      "The tier that is really about AI is Premium+, and at $40/month it is both outside this budget and behind the $20 plans.",
    ],
    watchOut:
      "I would not recommend this to anyone as an AI subscription. If you want X for X anyway, that is a different decision and a fair one.",
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

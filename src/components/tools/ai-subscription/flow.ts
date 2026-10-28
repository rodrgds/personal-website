import type { PlanId } from "./plans";

export const LAST_CHECKED = "28 October 2026";

export interface FlowOption {
  readonly label: string;
  readonly next: string;
}

export interface FlowNode {
  readonly id: string;
  readonly question: string;
  readonly hint?: string;
  readonly options: readonly FlowOption[];
}

/** Terminals are plan ids. Everything else is `FlowNode.id`. */
export const START_NODE = "usage";

export const FLOW: readonly FlowNode[] = [
  {
    id: "usage",
    question: "What will you use it for most?",
    hint: "The thing you will actually do most, not what you would like to do.",
    options: [
      { label: "Writing code, mostly in an agent", next: "code-quality" },
      { label: "Chatting, writing, making images", next: "chat-priority" },
      { label: "Both, about the same", next: "both" },
      {
        label: "Storage, plus an assistant inside Google apps",
        next: "google-ai-pro",
      },
      { label: "I want X anyway", next: "x-premium" },
    ],
  },
  {
    id: "code-quality",
    question: "Does the smartest model matter?",
    hint: "Everything after this is detail.",
    options: [
      { label: "Yes. I want the best code", next: "budget" },
      { label: "No. I want a lot of good usage, cheap", next: "opencode-go" },
    ],
  },
  {
    id: "budget",
    question: "What can you spend a month?",
    options: [
      { label: "$20", next: "claude-pro" },
      { label: "$10", next: "opencode-go" },
    ],
  },
  {
    id: "chat-priority",
    question: "What do you want from the chat side?",
    options: [
      {
        label: "The most messages, plus real image generation",
        next: "chatgpt-plus",
      },
      {
        label: "Gemini inside Gmail, Docs and the rest",
        next: "google-ai-pro",
      },
    ],
  },
  {
    id: "both",
    question: "One plan has to cover both. Which half do you protect?",
    hint: "Whichever you would hate to hit a limit on first.",
    options: [
      { label: "The chat side. I want the most usage", next: "chatgpt-plus" },
      { label: "The coding side. I want the best code", next: "claude-pro" },
    ],
  },
];

const PLAN_IDS: ReadonlySet<string> = new Set<PlanId>([
  "claude-pro",
  "chatgpt-plus",
  "opencode-go",
  "google-ai-pro",
  "x-premium",
]);

export function isPlanId(value: string): value is PlanId {
  return PLAN_IDS.has(value);
}

export function nodeById(id: string): FlowNode | null {
  return FLOW.find((node) => node.id === id) ?? null;
}

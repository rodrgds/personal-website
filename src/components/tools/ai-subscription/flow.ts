import type { PlanId } from "./plans";

export const LAST_CHECKED = "28 October 2026";

export interface FlowOption {
  readonly label: string;
  readonly next: string;
}

export interface FlowNode {
  readonly id: string;
  readonly question: string;
  readonly hint: string;
  readonly options: readonly FlowOption[];
}

/** Terminals are plan ids. Everything else is `FlowNode.id`. */
export const START_NODE = "usage";

export const FLOW: readonly FlowNode[] = [
  {
    id: "usage",
    question: "What will you use it for, most of the time?",
    hint: "Pick the thing you will do most, not the thing you would like to do. That is the mistake almost everyone makes here.",
    options: [
      { label: "Writing code, mostly inside an agent", next: "code-quality" },
      { label: "Chatting, writing, making images", next: "chat-priority" },
      { label: "Both, roughly the same amount", next: "both" },
      {
        label: "Storage, plus an assistant inside Google apps",
        next: "google-storage",
      },
      { label: "I want X anyway", next: "x-premium" },
    ],
  },
  {
    id: "code-quality",
    question: "How much does having the smartest model matter to you?",
    hint: "This is the whole decision. Everything after it is detail.",
    options: [
      { label: "A lot. I want the best code I can get", next: "budget" },
      {
        label: "Enough. I want a lot of good usage, cheaply",
        next: "opencode-go",
      },
    ],
  },
  {
    id: "budget",
    question: "What can you put on the card each month, tax included?",
    hint: "Tax turns a $20 US price into roughly €22–25 across the EU.",
    options: [
      { label: "$20–25", next: "claude-pro" },
      { label: "About $10", next: "opencode-go" },
    ],
  },
  {
    id: "chat-priority",
    question: "What do you want out of the chat side?",
    hint: "Chat and coding limits are separate on ChatGPT, which is why this branch exists.",
    options: [
      {
        label: "The most messages possible, plus real image generation",
        next: "chatgpt-plus",
      },
      {
        label: "Gemini inside Gmail, Docs and the rest of Workspace",
        next: "google-storage",
      },
    ],
  },
  {
    id: "both",
    question: "One plan has to cover both. Which half do you protect?",
    hint: "Whichever you would hate to see hit a limit first is the one you are really buying.",
    options: [
      {
        label: "The chat side. I want the most total usage",
        next: "chatgpt-plus",
      },
      { label: "The coding side. I want the best code", next: "claude-pro" },
    ],
  },
  {
    id: "google-storage",
    question: "Are you already paying Google for extra storage?",
    hint: "If you are, the assistant part of the plan costs almost nothing on top.",
    options: [
      { label: "Yes, I pay for storage already", next: "google-ai-pro" },
      { label: "No, 15 GB is enough for me", next: "chatgpt-plus" },
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

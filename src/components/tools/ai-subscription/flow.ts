import type { PlanId } from "./plans";

export const LAST_CHECKED = "28 October 2026";

export interface FlowNode {
  readonly id: string;
  readonly question: string;
  /** Node id or plan id. */
  readonly yes: string;
  /** Node id or plan id. */
  readonly no: string;
}

/** The chart every reader walks: yes/no, one question at a time. */
export const START_NODE = "x-only";

export const FLOW: readonly FlowNode[] = [
  {
    id: "x-only",
    question: "Do you just want X without the ads?",
    yes: "x-premium",
    no: "storage",
  },
  {
    id: "storage",
    question: "Is your Gmail or Drive running out of space?",
    yes: "google-ai-pro",
    no: "code",
  },
  {
    id: "code",
    question: "Do you write code more than you chat?",
    yes: "chat-app",
    no: "chatgpt-plus",
  },
  {
    id: "chat-app",
    question: "Would you give up the chat app for half the price?",
    yes: "opencode-go",
    no: "sharpest",
  },
  {
    id: "sharpest",
    question: "Is the single best model worth running out sooner?",
    yes: "claude-pro",
    no: "chatgpt-plus",
  },
];

const PLAN_IDS: ReadonlySet<string> = new Set<PlanId>([
  "chatgpt-plus",
  "claude-pro",
  "opencode-go",
  "google-ai-pro",
  "x-premium",
]);

export function isPlanId(value: string): value is PlanId {
  return PLAN_IDS.has(value);
}

export function nodeById(id: string): FlowNode {
  const match = FLOW.find((node) => node.id === id);
  if (!match) throw new Error(`Unknown node: ${id}`);
  return match;
}

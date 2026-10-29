import type { PlanId } from "./plans";

export interface FlowNode {
  readonly id: string;
  readonly question: string;
  /** Node id or plan id. */
  readonly yes: string;
  /** Node id or plan id. */
  readonly no: string;
}

/** Preference tree: one recommendation per path. */
export const START_NODE = "google";
export const FLOW: readonly FlowNode[] = [
  {
    id: "google",
    question: "Do you want Gemini in Gmail and Drive?",
    yes: "google-ai-pro",
    no: "code",
  },
  {
    id: "code",
    question: "Do you want a coding-focused subscription?",
    yes: "usage",
    no: "claude",
  },
  {
    id: "usage",
    question: "More coding usage with weaker models?",
    yes: "opencode-go",
    no: "claude",
  },
  {
    id: "claude",
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
]);

export function isPlanId(value: string): value is PlanId {
  return PLAN_IDS.has(value);
}

export function nodeById(id: string): FlowNode {
  const match = FLOW.find((node) => node.id === id);
  if (!match) throw new Error(`Unknown node: ${id}`);
  return match;
}

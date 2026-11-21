// Completion for the tty. Given the input line, returns the lines it could
// become, best first. It follows the shell: program names after `|`, `;`, `&&`
// and `||`, flags per program, paths on the virtual file system, and ask
// questions. Pure, so it is easy to reason about.
import type { TtyData } from "./tty-data";
import { ASK_SUGGESTIONS } from "./shell/ask";
import type { Fs } from "./shell/vfs";

export { ASK_SUGGESTIONS };

export interface Completion {
  /** The whole input line after accepting this candidate. */
  value: string;
  /** What the menu shows. */
  label: string;
  /** A short hint next to the label. */
  note?: string;
}

export interface CommandInfo {
  name: string;
  summary: string;
  flags: string[];
  takes: "path" | "dir" | "words" | "program" | "none";
  pathsFrom?: number;
}

export interface CompletionContext {
  data: TtyData | null;
  fs: Fs | null;
  cwd: string;
  commands: CommandInfo[];
}

interface Option {
  word: string;
  note?: string;
  /** Appended after the word; a space unless it is a directory. */
  tail?: string;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function rank(options: Option[], partial: string): Option[] {
  const wanted = normalize(partial);
  const seen = new Set<string>();
  const unique = options.filter((option) => {
    const key = normalize(option.word);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!wanted) return unique;
  const prefix = unique.filter((option) =>
    normalize(option.word).startsWith(wanted),
  );
  const inside = unique.filter(
    (option) =>
      !normalize(option.word).startsWith(wanted) &&
      normalize(`${option.word} ${option.note ?? ""}`).includes(wanted),
  );
  return [...prefix, ...inside];
}

/** Where the last pipeline stage starts: after the final unquoted operator. */
interface StageSplit {
  before: string;
  stage: string;
}

function splitStage(input: string): StageSplit {
  let quote = "";
  let cut = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = "";
      else if (char === "\\" && quote === '"') i++;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "\\") i++;
    else if (char === "|" || char === ";" || char === "&" || char === ">")
      cut = i + 1;
  }
  const rest = input.slice(cut);
  const lead = rest.match(/^\s*/)?.[0] ?? "";
  return { before: input.slice(0, cut) + lead, stage: rest.slice(lead.length) };
}

/** The text after the last unquoted space, and everything before it. */
interface PartialSplit {
  head: string;
  partial: string;
}

function splitPartial(stage: string): PartialSplit {
  let quote = "";
  let cut = -1;
  for (let i = 0; i < stage.length; i++) {
    const char = stage[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"') quote = char;
    else if (char === " ") cut = i;
  }
  return { head: stage.slice(0, cut + 1), partial: stage.slice(cut + 1) };
}

function pathOptions(
  context: CompletionContext,
  partial: string,
  dirsOnly: boolean,
): Option[] {
  const { fs, cwd } = context;
  if (!fs) return [];
  if (partial === "~") return [{ word: "~/", note: "home" }];
  const slash = partial.lastIndexOf("/");
  const dirPart = partial.slice(0, slash + 1);
  const namePart = partial.slice(slash + 1);
  const node = fs.lookup(fs.resolve(cwd, dirPart || "."));
  if (node?.kind !== "dir") return [];
  const options: Option[] = [];
  if (!dirPart && namePart.startsWith(".") && namePart.length <= 2)
    options.push({ word: "../", note: "up" });
  for (const name of fs.names(node, namePart.startsWith("."))) {
    if (!name.toLowerCase().startsWith(namePart.toLowerCase())) continue;
    const child = node.children.get(name);
    if (!child) continue;
    if (dirsOnly && child.kind !== "dir") continue;
    options.push(
      child.kind === "dir"
        ? { word: `${dirPart}${name}/`, note: "dir", tail: "" }
        : {
            word: `${dirPart}${name}`,
            note: child.exec ? "program" : child.kindLabel.toLowerCase(),
            tail: "",
          },
    );
  }
  return options;
}

function argumentOptions(
  command: CommandInfo,
  words: string[],
  partial: string,
  context: CompletionContext,
): Option[] {
  const { data } = context;
  if (partial.startsWith("-") && command.flags.length > 0)
    return command.flags.map((flag) => ({ word: flag, note: "option" }));
  switch (command.name) {
    case "theme":
      return [
        { word: "dark", note: "crt amber" },
        { word: "light", note: "paper terminal" },
        { word: "toggle" },
      ];
    case "sound":
      return [{ word: "on" }, { word: "off" }];
    case "cv":
      return data?.cv.map((pdf) => ({ word: pdf.label, note: pdf.note })) ?? [];
    default:
  }
  switch (command.takes) {
    case "program":
      return context.commands.map((info) => ({
        word: info.name,
        note: info.summary,
      }));
    case "dir":
      return pathOptions(context, partial, true);
    case "path": {
      const from = command.pathsFrom ?? 0;
      const position = words.filter((word) => !word.startsWith("-")).length;
      if (position < from) return [];
      const options = pathOptions(context, partial, false);
      if (command.name !== "open" || partial.includes("/")) return options;
      return [
        ...options,
        ...(data?.pages.map((page) => ({
          word: page.label,
          note: page.note,
        })) ?? []),
      ];
    }
    default:
      return [];
  }
}

function askOptions(partial: string): Completion[] | null {
  const quote = partial[0] === '"' || partial[0] === "'" ? partial[0] : "";
  const typed = quote ? partial.slice(1) : partial;
  const matches = rank(
    ASK_SUGGESTIONS.map((question) => ({ word: question })),
    typed,
  );
  return matches.map((option) => ({
    value: quote
      ? `${quote}${option.word}${quote}`
      : typed
        ? option.word
        : `"${option.word}"`,
    label: option.word,
  }));
}

export function complete(
  input: string,
  context: CompletionContext,
): Completion[] {
  const { before, stage } = splitStage(input);
  const space = stage.indexOf(" ");

  if (space < 0) {
    return rank(
      context.commands.map((info) => ({ word: info.name, note: info.summary })),
      stage,
    ).map((option) => ({
      value: `${before}${option.word} `,
      label: option.word,
      note: option.note,
    }));
  }

  const name = stage.slice(0, space).toLowerCase();
  const command = context.commands.find((info) => info.name === name);
  if (!command) return [];

  if (command.name === "ask") {
    const rest = stage.slice(space + 1);
    return (askOptions(rest) ?? []).map((item) => ({
      ...item,
      value: `${before}${stage.slice(0, space + 1)}${item.value}`,
    }));
  }

  const { head, partial } = splitPartial(stage);
  const words = head.split(/\s+/).filter(Boolean).slice(1);
  return rank(argumentOptions(command, words, partial, context), partial).map(
    (option) => ({
      value: `${before}${head}${option.word}${option.tail ?? " "}`,
      label: option.word,
      note: option.note,
    }),
  );
}

/** The longest start shared by every value, used for the first Tab press. */
export function commonPrefix(values: string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let i = 0;
    while (
      i < prefix.length &&
      i < value.length &&
      prefix[i].toLowerCase() === value[i].toLowerCase()
    )
      i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

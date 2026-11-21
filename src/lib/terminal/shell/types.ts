import type { TtyData } from "../tty-data";
import type { Out } from "./io";
import type { Fs } from "./vfs";

export type Group =
  | "navigation"
  | "files"
  | "text"
  | "fun"
  | "socials"
  | "system";

/** What a program may do to the page around the terminal. */
export interface Host {
  /** Navigate inside the site (closes the terminal) or open mailto. */
  go(href: string): void;
  /** Open an external link in a new tab, keeping the terminal open. */
  openTab(url: string): void;
  close(): void;
  clear(): void;
  theme(wanted: string): string;
  sound(wanted: string): string;
  donut(): void;
  matrix(): void;
  /** Fly out of the computer, then out of the next one, until Esc. */
  inception(): void;
  reboot(): void;
  /** A dim "thinking" line while waiting; null removes it. */
  status(text: string | null): void;
}

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Io {
  args: string[];
  /** Text piped in, or null when nothing was piped. */
  stdin: string | null;
  out: Out;
  err: Out;
  signal: AbortSignal;
  /** True when this program writes straight to the screen. */
  live: boolean;
}

export interface Shell {
  data: TtyData;
  fs: Fs;
  cwd: string;
  oldCwd: string;
  status: number;
  history: string[];
  askHistory: AskTurn[];
  host: Host;
  programs: Map<string, Program>;
  /** Run one command (used by xargs). */
  run(argv: string[], io: Io): Promise<number>;
}

export interface Program {
  name: string;
  group: Group;
  /** One line for `help`; empty hides the program from the list. */
  summary: string;
  usage: string;
  flags: string[];
  /** What the arguments are, for completion. */
  takes: "path" | "dir" | "words" | "program" | "none";
  /** Index of the first path argument (grep takes a pattern first). */
  pathsFrom?: number;
  run(shell: Shell, io: Io): number | Promise<number>;
}

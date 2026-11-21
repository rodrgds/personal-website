// The interpreter: runs a parsed line with pipes, `;`, `&&` and `||`.
import { expandWord } from "./expand";
import { NULL_OUT, bufferOut, writeLine } from "./io";
import type { Out } from "./io";
import { parseLine } from "./lexer";
import type { Stage } from "./lexer";
import type { Io, Shell } from "./types";

/** Where the last pipeline stage and errors go on screen. */
export interface Screen {
  out(): Out;
  err(): Out;
}

const ALIASES = new Map<string, string[]>([
  ["q", ["exit"]],
  [":q", ["exit"]],
  ["quit", ["exit"]],
  ["about", ["whoami"]],
  ["vi", ["vim"]],
  ["nvim", ["vim"]],
  ["email", ["mail"]],
  ["?", ["help"]],
  ["ll", ["ls", "-l"]],
  ["la", ["ls", "-a"]],
  ["l", ["ls", "-l"]],
]);

export function aliasFor(name: string): string[] | undefined {
  return ALIASES.get(name);
}

export function aliasNames(): string[] {
  return [...ALIASES.keys()];
}

function fail(screen: Screen, message: string): void {
  const err = screen.err();
  writeLine(err, message, "err");
  err.finish();
}

async function runStage(
  shell: Shell,
  stage: Stage,
  stdin: string | null,
  last: boolean,
  screen: Screen,
  signal: AbortSignal,
): Promise<{ status: number; text: string }> {
  const argv = stage.words.flatMap((word) => expandWord(shell, word));
  if (stage.redirect) {
    const target = expandWord(shell, stage.redirect.target)[0] ?? "";
    if (target !== "/dev/null") {
      fail(screen, `bash: ${target}: Read-only file system`);
      return { status: 1, text: "" };
    }
  }
  if (argv.length === 0) return { status: 0, text: "" };

  const discard = stage.redirect !== undefined;
  const buffer = bufferOut();
  const out = discard ? NULL_OUT : last ? screen.out() : buffer.out;
  const io: Io = {
    args: [],
    stdin,
    out,
    err: screen.err(),
    signal,
    live: last && !discard,
  };
  const status = await shell.run(argv, io);
  out.finish();
  io.err.finish();
  return { status, text: buffer.text() };
}

/** Run one line. Returns the exit status of the last command. */
export async function runLine(
  shell: Shell,
  line: string,
  screen: Screen,
  signal: AbortSignal,
): Promise<number> {
  const parsed = parseLine(line);
  if (!parsed.ok) {
    fail(screen, parsed.error);
    shell.status = 2;
    return 2;
  }
  let skip = false;
  for (const item of parsed.items) {
    if (!skip) {
      let input: string | null = null;
      for (let index = 0; index < item.stages.length; index++) {
        if (signal.aborted) break;
        const isLast = index === item.stages.length - 1;
        const result = await runStage(
          shell,
          item.stages[index],
          input,
          isLast,
          screen,
          signal,
        );
        shell.status = result.status;
        input = result.text;
      }
    }
    if (item.next === "&&") skip = shell.status !== 0;
    else if (item.next === "||") skip = shell.status === 0;
    else skip = false;
    if (signal.aborted) break;
  }
  return shell.status;
}

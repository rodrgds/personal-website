// Option parsing and input reading shared by the programs.
import { writeLine } from "./io";
import type { Io, Shell } from "./types";

export interface Options {
  flags: Set<string>;
  values: Map<string, string>;
  rest: string[];
  /** Set when an option was not recognised; the message is already printed. */
  invalid: boolean;
}

/**
 * Parse `-abc`, `-n 5`, `-n5` and `--`. `valued` lists options that take a
 * value; `bare` lists the plain switches. With `numeric`, `-5` means `-n 5`.
 */
export function parseOptions(
  command: string,
  args: string[],
  bare: string,
  valued: string,
  io: Io,
  numeric = false,
): Options {
  const result: Options = {
    flags: new Set(),
    values: new Map(),
    rest: [],
    invalid: false,
  };
  let done = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (done || arg === "-" || !arg.startsWith("-")) {
      result.rest.push(arg);
      continue;
    }
    if (arg === "--") {
      done = true;
      continue;
    }
    if (numeric && /^-\d+$/.test(arg)) {
      result.values.set("n", arg.slice(1));
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const char = arg[j];
      if (valued.includes(char)) {
        const inline = arg.slice(j + 1);
        result.values.set(char, inline || (args[++i] ?? ""));
        break;
      }
      if (bare.includes(char)) {
        result.flags.add(char);
      } else {
        writeLine(io.err, `${command}: invalid option -- '${char}'`, "err");
        writeLine(
          io.err,
          `Try '${command} --help' for more information.`,
          "dim",
        );
        result.invalid = true;
        return result;
      }
    }
  }
  return result;
}

export interface Input {
  name: string;
  text: string;
}

/** Text from the named files, or from stdin when there are none. */
export interface Inputs {
  inputs: Input[];
  status: number;
}

export function readInputs(
  shell: Shell,
  io: Io,
  command: string,
  files: string[],
): Inputs {
  if (files.length === 0)
    return {
      inputs: io.stdin === null ? [] : [{ name: "-", text: io.stdin }],
      status: 0,
    };
  const inputs: Input[] = [];
  let status = 0;
  for (const name of files) {
    if (name === "-") {
      inputs.push({ name, text: io.stdin ?? "" });
      continue;
    }
    const node = shell.fs.lookup(shell.fs.resolve(shell.cwd, name));
    if (!node) {
      writeLine(
        io.err,
        `${command}: ${name}: No such file or directory`,
        "err",
      );
      status = 1;
    } else if (node.kind === "dir") {
      writeLine(io.err, `${command}: ${name}: Is a directory`, "err");
      status = 1;
    } else if (node.binary) {
      writeLine(io.err, `${command}: ${name}: binary file`, "err");
      status = 1;
    } else {
      inputs.push({ name, text: node.content });
    }
  }
  return { inputs, status };
}

export function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function fromLines(lines: string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

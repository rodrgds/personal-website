// Text programs: they read stdin when piped and files otherwise.
import { fromLines, parseOptions, readInputs, toLines } from "./args";
import { writeLine } from "./io";
import type { Io, Program, Shell } from "./types";

function text(
  name: string,
  summary: string,
  usage: string,
  flags: string[],
  run: Program["run"],
  extra: Partial<Program> = {},
): Program {
  return {
    name,
    group: "text",
    summary,
    usage,
    flags,
    takes: "path",
    run,
    ...extra,
  };
}

function lineCount(options: string | undefined, fallback: number): number {
  const value = Number.parseInt(options ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function noInput(io: Io, command: string): number {
  writeLine(
    io.err,
    `${command}: no input (pipe something in, or name a file)`,
    "err",
  );
  return 1;
}

function unescape(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

const echo = text(
  "echo",
  "print its arguments",
  "echo [-ne] [text...]",
  ["-n", "-e"],
  (_shell, io) => {
    let args = io.args;
    let newline = true;
    let escapes = false;
    while (args[0] && /^-[ne]+$/.test(args[0])) {
      if (args[0].includes("n")) newline = false;
      if (args[0].includes("e")) escapes = true;
      args = args.slice(1);
    }
    let output = args.join(" ");
    if (escapes) output = unescape(output);
    io.out.write(newline ? `${output}\n` : output);
    return 0;
  },
  { takes: "none" },
);

const cat = text(
  "cat",
  "print files, or what is piped in",
  "cat [-n] [file...]",
  ["-n"],
  (shell, io) => {
    const options = parseOptions("cat", io.args, "n", "", io);
    if (options.invalid) return 2;
    const { inputs, status } = readInputs(shell, io, "cat", options.rest);
    let number = 0;
    for (const input of inputs) {
      if (options.flags.has("n")) {
        for (const line of toLines(input.text))
          io.out.write(`${String(++number).padStart(6)}\t${line}\n`);
      } else {
        io.out.write(input.text);
      }
    }
    return status;
  },
  { group: "files" },
);

function pagerProgram(name: string): Program {
  return {
    ...cat,
    name,
    summary: `same as cat (${name} has no pages here)`,
    usage: `${name} [file...]`,
    flags: [],
    run: cat.run,
  };
}

const grep = text(
  "grep",
  "print lines that match a pattern",
  "grep [-ivncE] pattern [file...]",
  ["-i", "-v", "-n", "-c", "-E"],
  (shell, io) => {
    const options = parseOptions("grep", io.args, "ivncEF", "", io);
    if (options.invalid) return 2;
    const [pattern, ...files] = options.rest;
    if (pattern === undefined) {
      writeLine(io.err, "usage: grep [-ivncE] pattern [file...]", "err");
      return 2;
    }
    let matcher: RegExp;
    try {
      const source = options.flags.has("F")
        ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        : options.flags.has("E")
          ? pattern
          : pattern.replace(/[+?(){}|]/g, "\\$&");
      matcher = new RegExp(source, options.flags.has("i") ? "i" : "");
    } catch {
      writeLine(io.err, `grep: invalid regular expression: ${pattern}`, "err");
      return 2;
    }
    const { inputs, status: readStatus } = readInputs(shell, io, "grep", files);
    if (files.length === 0 && io.stdin === null) return noInput(io, "grep");
    const invert = options.flags.has("v");
    let matched = 0;
    for (const input of inputs) {
      let count = 0;
      toLines(input.text).forEach((line, index) => {
        if (matcher.test(line) === invert) return;
        count++;
        if (options.flags.has("c")) return;
        const prefix = [
          inputs.length > 1 ? input.name : "",
          options.flags.has("n") ? String(index + 1) : "",
        ].filter(Boolean);
        io.out.write(
          prefix.length ? `${prefix.join(":")}:${line}\n` : `${line}\n`,
        );
      });
      matched += count;
      if (options.flags.has("c"))
        io.out.write(`${inputs.length > 1 ? `${input.name}:` : ""}${count}\n`);
    }
    if (readStatus !== 0) return 2;
    return matched > 0 ? 0 : 1;
  },
  { pathsFrom: 1 },
);

function headTail(name: "head" | "tail"): Program {
  return text(
    name,
    `print the ${name === "head" ? "first" : "last"} lines`,
    `${name} [-n N] [file...]`,
    ["-n"],
    (shell, io) => {
      const options = parseOptions(name, io.args, "", "n", io, true);
      if (options.invalid) return 2;
      const count = lineCount(options.values.get("n"), 10);
      const { inputs, status } = readInputs(shell, io, name, options.rest);
      if (options.rest.length === 0 && io.stdin === null)
        return noInput(io, name);
      for (const input of inputs) {
        if (inputs.length > 1) io.out.write(`==> ${input.name} <==\n`);
        const lines = toLines(input.text);
        const picked =
          name === "head"
            ? lines.slice(0, count)
            : count === 0
              ? []
              : lines.slice(-count);
        io.out.write(fromLines(picked));
      }
      return status;
    },
  );
}

const wc = text(
  "wc",
  "count lines, words and bytes",
  "wc [-lwc] [file...]",
  ["-l", "-w", "-c"],
  (shell, io) => {
    const options = parseOptions("wc", io.args, "lwc", "", io);
    if (options.invalid) return 2;
    const { inputs, status } = readInputs(shell, io, "wc", options.rest);
    if (options.rest.length === 0 && io.stdin === null)
      return noInput(io, "wc");
    const all = !options.flags.size;
    const rows = inputs.map((input) => {
      const values: number[] = [];
      if (all || options.flags.has("l"))
        values.push(input.text.split("\n").length - 1);
      if (all || options.flags.has("w"))
        values.push(input.text.split(/\s+/).filter(Boolean).length);
      if (all || options.flags.has("c"))
        values.push(new TextEncoder().encode(input.text).length);
      return { name: input.name, values };
    });
    const width = String(
      Math.max(0, ...rows.flatMap((row) => row.values)),
    ).length;
    for (const row of rows) {
      const single = row.values.length === 1 && options.rest.length === 0;
      const cells = row.values.map((value) =>
        single ? String(value) : String(value).padStart(Math.max(width, 1)),
      );
      io.out.write(
        `${cells.join(" ")}${row.name === "-" ? "" : ` ${row.name}`}\n`,
      );
    }
    return status;
  },
);

const sort = text(
  "sort",
  "sort lines",
  "sort [-rnuf] [file...]",
  ["-r", "-n", "-u", "-f"],
  (shell, io) => {
    const options = parseOptions("sort", io.args, "rnuf", "", io);
    if (options.invalid) return 2;
    const { inputs, status } = readInputs(shell, io, "sort", options.rest);
    if (options.rest.length === 0 && io.stdin === null)
      return noInput(io, "sort");
    let lines = inputs.flatMap((input) => toLines(input.text));
    const lead = (line: string): number => Number.parseFloat(line) || 0;
    const fold = options.flags.has("f");
    lines.sort((a, b) =>
      options.flags.has("n")
        ? lead(a) - lead(b) || a.localeCompare(b, "en")
        : (fold ? a.toLowerCase() : a).localeCompare(
            fold ? b.toLowerCase() : b,
            "en",
          ),
    );
    if (options.flags.has("r")) lines.reverse();
    if (options.flags.has("u"))
      lines = lines.filter(
        (line, index) => index === 0 || line !== lines[index - 1],
      );
    io.out.write(fromLines(lines));
    return status;
  },
);

const uniq = text(
  "uniq",
  "collapse repeated adjacent lines",
  "uniq [-c] [file]",
  ["-c", "-d"],
  (shell, io) => {
    const options = parseOptions("uniq", io.args, "cd", "", io);
    if (options.invalid) return 2;
    const { inputs, status } = readInputs(
      shell,
      io,
      "uniq",
      options.rest.slice(0, 1),
    );
    if (options.rest.length === 0 && io.stdin === null)
      return noInput(io, "uniq");
    const groups: Array<{ line: string; count: number }> = [];
    for (const line of inputs.flatMap((input) => toLines(input.text))) {
      const last = groups[groups.length - 1];
      if (last?.line === line) last.count++;
      else groups.push({ line, count: 1 });
    }
    for (const group of groups) {
      if (options.flags.has("d") && group.count < 2) continue;
      io.out.write(
        options.flags.has("c")
          ? `${String(group.count).padStart(7)} ${group.line}\n`
          : `${group.line}\n`,
      );
    }
    return status;
  },
);

function selectFields(spec: string): number[] | null {
  const picked: number[] = [];
  for (const part of spec.split(",")) {
    const match = /^(\d*)(-?)(\d*)$/.exec(part);
    if (!match || (!match[1] && !match[3])) return null;
    const from = Number(match[1] || 1);
    const to = match[2] ? Number(match[3] || 500) : from;
    for (let n = from; n <= to; n++) picked.push(n);
  }
  return picked;
}

const cut = text(
  "cut",
  "pick columns: cut -d, -f1,3",
  "cut -d DELIM -f LIST | cut -c LIST [file...]",
  ["-d", "-f", "-c"],
  (shell, io) => {
    const options = parseOptions("cut", io.args, "", "dfc", io);
    if (options.invalid) return 2;
    const chars = options.values.get("c");
    const fields = options.values.get("f");
    const picked = selectFields(chars ?? fields ?? "");
    if (!picked) {
      writeLine(
        io.err,
        "cut: you must specify a list of bytes, characters, or fields",
        "err",
      );
      return 1;
    }
    const delimiter = options.values.get("d") || "\t";
    const { inputs, status } = readInputs(shell, io, "cut", options.rest);
    if (options.rest.length === 0 && io.stdin === null)
      return noInput(io, "cut");
    for (const input of inputs) {
      for (const line of toLines(input.text)) {
        if (chars !== undefined) {
          io.out.write(`${picked.map((n) => line[n - 1] ?? "").join("")}\n`);
          continue;
        }
        const parts = line.split(delimiter);
        io.out.write(
          parts.length === 1
            ? `${line}\n`
            : `${picked
                .filter((n) => n <= parts.length)
                .map((n) => parts[n - 1])
                .join(delimiter)}\n`,
        );
      }
    }
    return status;
  },
);

const CLASSES = new Map<string, string>([
  ["[:upper:]", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  ["[:lower:]", "abcdefghijklmnopqrstuvwxyz"],
  ["[:digit:]", "0123456789"],
  ["[:alpha:]", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"],
  ["[:space:]", " \t\n"],
]);

function expandSet(set: string): string[] {
  let source = unescape(set);
  for (const [name, chars] of CLASSES) source = source.split(name).join(chars);
  const chars = [...source];
  const result: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i + 1] === "-" && i + 2 < chars.length) {
      const from = chars[i].codePointAt(0) ?? 0;
      const to = chars[i + 2].codePointAt(0) ?? 0;
      for (let code = from; code <= to; code++)
        result.push(String.fromCodePoint(code));
      i += 2;
    } else result.push(chars[i]);
  }
  return result;
}

const tr = text(
  "tr",
  "translate or delete characters: tr a-z A-Z",
  "tr [-ds] set1 [set2]",
  ["-d", "-s"],
  (_shell, io) => {
    const options = parseOptions("tr", io.args, "ds", "", io);
    if (options.invalid) return 2;
    const [first, second] = options.rest;
    if (
      first === undefined ||
      (second === undefined &&
        !options.flags.has("d") &&
        !options.flags.has("s"))
    ) {
      writeLine(io.err, "tr: missing operand", "err");
      return 1;
    }
    if (io.stdin === null) return noInput(io, "tr");
    const from = expandSet(first);
    const to = expandSet(second ?? "");
    let result = "";
    let previous = "";
    for (const char of io.stdin) {
      const index = from.indexOf(char);
      let next = char;
      if (options.flags.has("d") && index >= 0) continue;
      if (!options.flags.has("d") && index >= 0 && to.length > 0)
        next = to[Math.min(index, to.length - 1)];
      if (
        options.flags.has("s") &&
        next === previous &&
        (index >= 0 || to.length === 0)
      )
        continue;
      result += next;
      previous = next;
    }
    io.out.write(result);
    return 0;
  },
  { takes: "none" },
);

function perLine(
  name: string,
  summary: string,
  transform: (lines: string[]) => string[],
): Program {
  return text(name, summary, `${name} [file...]`, [], (shell, io) => {
    const { inputs, status } = readInputs(shell, io, name, io.args);
    if (io.args.length === 0 && io.stdin === null) return noInput(io, name);
    for (const input of inputs)
      io.out.write(fromLines(transform(toLines(input.text))));
    return status;
  });
}

const rev = perLine("rev", "reverse each line", (lines) =>
  lines.map((line) => [...line].reverse().join("")),
);
const tac = perLine("tac", "print lines last to first", (lines) =>
  lines.reverse(),
);
const nl = perLine("nl", "number lines", (lines) =>
  lines.map((line, index) => `${String(index + 1).padStart(6)}\t${line}`),
);

const tee = text(
  "tee",
  "copy stdin to the screen (files are read-only)",
  "tee [file...]",
  [],
  (_shell, io) => {
    io.out.write(io.stdin ?? "");
    for (const file of io.args) {
      writeLine(io.err, `tee: ${file}: Read-only file system`, "err");
    }
    return io.args.length > 0 ? 1 : 0;
  },
);

const xargs = text(
  "xargs",
  "run a program on piped words: ... | xargs cat",
  "xargs [program [args...]]",
  [],
  async (shell: Shell, io) => {
    const command = io.args.length > 0 ? io.args : ["echo"];
    const items = (io.stdin ?? "").split(/\s+/).filter(Boolean);
    if (items.length === 0) return 0;
    return shell.run([...command, ...items], io);
  },
  { takes: "program" },
);

const seq = text(
  "seq",
  "print a range of numbers",
  "seq [first] last",
  [],
  (_shell, io) => {
    const numbers = io.args.map(Number);
    const [first, last] = numbers.length > 1 ? numbers : [1, numbers[0]];
    if (
      numbers.length === 0 ||
      [first, last].some((n) => !Number.isFinite(n))
    ) {
      writeLine(io.err, "usage: seq [first] last", "err");
      return 1;
    }
    for (let n = first; n <= last && n - first < 10_000; n++)
      io.out.write(`${n}\n`);
    return 0;
  },
  { takes: "none" },
);

const cowsay = text(
  "cowsay",
  "a cow says it",
  "cowsay [text...]  or  ... | cowsay",
  [],
  (_shell, io) => {
    const message = (
      io.args.length > 0 ? io.args.join(" ") : (io.stdin ?? "moo").trim()
    )
      .split("\n")
      .map((line) => line.slice(0, 40));
    const width = Math.max(...message.map((line) => line.length));
    const border = (open: string, close: string, line: string): string =>
      `${open} ${line.padEnd(width)} ${close}`;
    const body =
      message.length === 1
        ? [border("<", ">", message[0])]
        : message.map((line, index) =>
            index === 0
              ? border("/", "\\", line)
              : index === message.length - 1
                ? border("\\", "/", line)
                : border("|", "|", line),
          );
    io.out.write(
      [
        ` ${"_".repeat(width + 2)} `,
        ...body,
        ` ${"-".repeat(width + 2)} `,
        "        \\   ^__^",
        "         \\  (oo)\\_______",
        "            (__)\\       )\\/\\",
        "                ||----w |",
        "                ||     ||",
        "",
      ].join("\n"),
      "accent",
    );
    return 0;
  },
  { group: "fun", takes: "none" },
);

export const TEXT_PROGRAMS: Program[] = [
  echo,
  cat,
  pagerProgram("less"),
  pagerProgram("more"),
  grep,
  headTail("head"),
  headTail("tail"),
  wc,
  sort,
  uniq,
  cut,
  tr,
  rev,
  tac,
  nl,
  tee,
  xargs,
  seq,
  cowsay,
];

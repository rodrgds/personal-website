// Reads a command line the way bash does: quotes, escapes, pipes, `;`, `&&`,
// `||` and `>`/`>>`. Expansion of variables and globs happens later, per
// command, because `$?` changes between commands of one line.
export type Quote = "none" | "single" | "double";

export interface Segment {
  text: string;
  quote: Quote;
}

export type Word = Segment[];

export interface Redirect {
  op: ">" | ">>";
  target: Word;
}

export interface Stage {
  words: Word[];
  redirect?: Redirect;
}

export type Connector = ";" | "&&" | "||";

export interface ListItem {
  stages: Stage[];
  /** What follows this pipeline on the line, if anything. */
  next: Connector | null;
}

export type ParseResult =
  | { ok: true; items: ListItem[] }
  | { ok: false; error: string };

interface OpToken {
  kind: "op";
  op: "|" | "||" | "&&" | ";" | ">" | ">>";
}

type Token = { kind: "word"; word: Word } | OpToken;

type TokenResult = { ok: true; tokens: Token[] } | { ok: false; error: string };

const DOUBLE_ESCAPES = new Set(['"', "$", "`", "\\"]);

function tokenize(input: string): TokenResult {
  const tokens: Token[] = [];
  let word: Word = [];
  let buffer = "";
  let bufferQuote: Quote = "none";
  let inWord = false;

  const flushSegment = (): void => {
    if (buffer || (bufferQuote !== "none" && inWord)) {
      word.push({ text: buffer, quote: bufferQuote });
    }
    buffer = "";
  };
  const push = (text: string, quote: Quote): void => {
    if (quote !== bufferQuote) {
      flushSegment();
      bufferQuote = quote;
    }
    buffer += text;
    inWord = true;
  };
  const flushWord = (): void => {
    flushSegment();
    if (inWord) tokens.push({ kind: "word", word });
    word = [];
    inWord = false;
    bufferQuote = "none";
  };

  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === "'") {
      const end = input.indexOf("'", i + 1);
      if (end < 0)
        return {
          ok: false,
          error: "bash: unexpected EOF while looking for matching `''",
        };
      inWord = true;
      flushSegment();
      word.push({ text: input.slice(i + 1, end), quote: "single" });
      bufferQuote = "none";
      i = end + 1;
      continue;
    }
    if (char === '"') {
      let text = "";
      let j = i + 1;
      let closed = false;
      while (j < input.length) {
        const inner = input[j];
        if (inner === "\\" && j + 1 < input.length) {
          const escaped = input[j + 1];
          text += DOUBLE_ESCAPES.has(escaped) ? escaped : `\\${escaped}`;
          j += 2;
          continue;
        }
        if (inner === '"') {
          closed = true;
          break;
        }
        text += inner;
        j++;
      }
      if (!closed)
        return {
          ok: false,
          error: "bash: unexpected EOF while looking for matching `\"'",
        };
      inWord = true;
      flushSegment();
      word.push({ text, quote: "double" });
      bufferQuote = "none";
      i = j + 1;
      continue;
    }
    if (char === "\\") {
      // A backslash outside quotes makes the next character literal.
      const next = input[i + 1];
      inWord = true;
      flushSegment();
      word.push({ text: next ?? "\\", quote: "single" });
      bufferQuote = "none";
      i += next === undefined ? 1 : 2;
      continue;
    }
    if (/\s/.test(char)) {
      flushWord();
      i++;
      continue;
    }
    if (char === "#" && !inWord) break;
    if (char === "|" || char === "&" || char === ";" || char === ">") {
      const two = input.slice(i, i + 2);
      let op: OpToken | null = null;
      if (two === "||" || two === "&&" || two === ">>")
        op = { kind: "op", op: two };
      else if (char === "|" || char === ";" || char === ">")
        op = { kind: "op", op: char };
      if (op) {
        flushWord();
        tokens.push(op);
        i += op.op.length;
        continue;
      }
    }
    push(char, "none");
    i++;
  }
  flushWord();
  return { ok: true, tokens };
}

function syntaxError(token: string): ParseResult {
  return {
    ok: false,
    error: `bash: syntax error near unexpected token \`${token}'`,
  };
}

export function parseLine(input: string): ParseResult {
  const lexed = tokenize(input);
  if (!lexed.ok) return lexed;

  const items: ListItem[] = [];
  let stages: Stage[] = [];
  let words: Word[] = [];
  let redirect: Redirect | undefined;
  let pendingRedirect: ">" | ">>" | null = null;

  const closeStage = (): boolean => {
    if (words.length === 0) return false;
    stages.push({ words, redirect });
    words = [];
    redirect = undefined;
    return true;
  };

  for (const token of lexed.tokens) {
    if (token.kind === "word") {
      if (pendingRedirect) {
        redirect = { op: pendingRedirect, target: token.word };
        pendingRedirect = null;
      } else {
        words.push(token.word);
      }
      continue;
    }
    if (pendingRedirect) return syntaxError(token.op);
    if (token.op === ">" || token.op === ">>") {
      pendingRedirect = token.op;
      continue;
    }
    if (!closeStage()) return syntaxError(token.op);
    if (token.op === "|") continue;
    items.push({ stages, next: token.op });
    stages = [];
  }
  if (pendingRedirect) return syntaxError("newline");
  if (words.length > 0 || redirect) {
    closeStage();
    items.push({ stages, next: null });
  } else if (stages.length > 0) {
    return { ok: false, error: "bash: syntax error: unexpected end of file" };
  } else {
    const last = items[items.length - 1];
    if (last && last.next !== ";" && last.next !== null)
      return { ok: false, error: "bash: syntax error: unexpected end of file" };
    if (last) last.next = null;
  }
  return { ok: true, items };
}

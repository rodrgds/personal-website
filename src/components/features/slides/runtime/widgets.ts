import { z } from "astro/zod";
import type { StepDetail } from "./steps";

// Interactive labs. Each lab can be driven by deck steps through presets, and
// stays editable so the presenter can try inputs live.

function presetsOf<T extends z.ZodTypeAny>(
  element: HTMLElement,
  schema: T,
): z.infer<T>[] {
  try {
    const parsed = z
      .array(schema)
      .safeParse(JSON.parse(element.dataset.presets ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function onStep(
  element: HTMLElement,
  handler: (detail: StepDetail) => void,
): void {
  const slide = element.closest<HTMLElement>("[data-slide]");
  slide?.addEventListener("deck:step", (event) => {
    if (event instanceof CustomEvent && event.detail) {
      const detail: StepDetail = event.detail;
      handler(detail);
    }
  });
}

/** Latest preset whose step has been reached. */
function presetAt<T extends { at: number }>(
  presets: T[],
  step: number,
): T | undefined {
  return presets.filter((preset) => preset.at <= step).at(-1);
}

function find<T extends Element>(root: Element, selector: string): T | null {
  return root.querySelector<T>(selector);
}

// ---------------------------------------------------------------- overflow

const BUF_ADDRESS = 0xbffff310;
const ORIGINAL_WORDS = [
  [0x3f, 0x3f, 0x3f, 0x3f],
  [0x3f, 0x3f, 0x3f, 0x3f],
  [0x3f, 0x3f, 0x3f, 0x3f],
  [0x3f, 0x3f, 0x3f, 0x3f],
  [0x48, 0xf3, 0xff, 0xbf],
  [0xb6, 0x84, 0x04, 0x08],
  [0xa0, 0xf5, 0xff, 0xbf],
];
const RET_WORD = 5;
const EBP_WORD = 4;
const BYTE_COUNT = ORIGINAL_WORDS.length * 4;

function tokens(input: string): string[] {
  return input.match(/\\x[0-9a-fA-F]{2}|[\s\S]/g) ?? [];
}

function decode(input: string): number[] {
  return tokens(input).map((token) =>
    token.length === 4
      ? Number.parseInt(token.slice(2), 16)
      : token.charCodeAt(0) & 0xff,
  );
}

const hex = (value: number, digits = 8) =>
  `0x${(value >>> 0).toString(16).padStart(digits, "0")}`;

function byteLabel(byte: number): string {
  if (byte >= 0x21 && byte <= 0x7e) return String.fromCharCode(byte);
  return byte.toString(16).padStart(2, "0");
}

function initOverflow(lab: HTMLElement): void {
  const input = find<HTMLInputElement>(lab, "[data-overflow-input]");
  const status = find<HTMLElement>(lab, "[data-overflow-status]");
  const count = find<HTMLElement>(lab, "[data-overflow-count]");
  if (!input || !status || !count) return;
  const presets = presetsOf(
    lab,
    z.object({ at: z.number(), input: z.string() }),
  );
  const words = [...lab.querySelectorAll<HTMLElement>("[data-word]")];

  for (const word of words) {
    const index = Number(word.dataset.word);
    const addr = word.querySelector("[data-word-addr]");
    if (addr) addr.textContent = hex(BUF_ADDRESS + index * 4);
  }

  const render = () => {
    const decoded = decode(input.value);
    const nul = decoded.indexOf(0);
    const copied = nul === -1 ? decoded : decoded.slice(0, nul);
    const written = [...copied, 0];
    const memory = ORIGINAL_WORDS.flat();
    written.forEach((byte, index) => {
      if (index < BYTE_COUNT) memory[index] = byte;
    });
    for (const word of words) {
      const index = Number(word.dataset.word);
      word
        .querySelectorAll<HTMLElement>(".overflow-byte")
        .forEach((cell, offset) => {
          const position = index * 4 + offset;
          const byte = memory[position];
          const touched = position < written.length;
          cell.textContent =
            touched || index >= EBP_WORD ? byteLabel(byte) : "";
          cell.toggleAttribute("data-written", touched);
          cell.toggleAttribute(
            "data-terminator",
            touched && position === written.length - 1,
          );
          cell.toggleAttribute("data-smashed", touched && index >= EBP_WORD);
        });
    }
    const word = (index: number) =>
      memory
        .slice(index * 4, index * 4 + 4)
        .reduceRight((value, byte) => value * 256 + byte, 0);
    const ret = word(RET_WORD);
    const retTouched = written.length > RET_WORD * 4;
    const ebpTouched = written.length > EBP_WORD * 4;
    const extra = Math.max(0, written.length - BYTE_COUNT);
    count.textContent = `${copied.length} bytes + \\0 → buf holds 16${extra ? ` · +${extra} bytes above the diagram` : ""}`;

    let tone = "ok";
    let message = `✓ ret intact (${hex(ret)}): returns to main`;
    if (retTouched && ret >= BUF_ADDRESS && ret < BUF_ADDRESS + 16) {
      tone = "pwned";
      message = `⚠ ret = ${hex(ret)} points into buf → the CPU runs the input: shellcode!`;
    } else if (retTouched) {
      tone = "bad";
      message = `✗ ret = ${hex(ret)} → jumps to garbage → Segmentation fault`;
    } else if (ebpTouched) {
      tone = "warn";
      message = "⚠ saved ebp corrupted: the caller now uses a wrong frame";
    }
    status.dataset.tone = tone;
    status.textContent = message;
  };

  let typing = 0;
  const type = (value: string, animate: boolean) => {
    window.clearInterval(typing);
    if (!animate) {
      input.value = value;
      render();
      return;
    }
    const parts = tokens(value);
    let shown = 0;
    input.value = "";
    render();
    typing = window.setInterval(() => {
      shown += 1;
      input.value = parts.slice(0, shown).join("");
      render();
      if (shown >= parts.length) window.clearInterval(typing);
    }, 45);
  };

  input.addEventListener("input", () => {
    window.clearInterval(typing);
    render();
  });
  onStep(lab, ({ step, forward }) => {
    const preset = presetAt(presets, step);
    if (preset && preset.input !== input.value)
      type(preset.input, forward && preset.at === step);
    if (!preset) type("", false);
  });
  render();
}

// ---------------------------------------------------------------- SQL

interface User {
  name: string;
  pass: string;
  role: string;
}

const USERS: User[] = [
  { name: "admin", pass: "Sup3r$ecret", role: "admin" },
  { name: "rodrigo", pass: "hunter2", role: "student" },
  { name: "maria", pass: "qwerty", role: "student" },
];

type Source = "code" | "user";
type TokenKind =
  | "space"
  | "string"
  | "number"
  | "word"
  | "op"
  | "comment"
  | "end";

interface Token {
  kind: TokenKind;
  text: string;
  value: string;
  start: number;
  end: number;
}

function lex(sql: string): Token[] {
  const result: Token[] = [];
  let index = 0;
  const push = (kind: TokenKind, end: number, value?: string) => {
    const text = sql.slice(index, end);
    result.push({ kind, text, value: value ?? text, start: index, end });
    index = end;
  };
  while (index < sql.length) {
    const char = sql[index];
    if (/\s/.test(char)) {
      let end = index;
      while (end < sql.length && /\s/.test(sql[end])) end += 1;
      push("space", end);
    } else if (char === "'" || char === '"') {
      let end = index + 1;
      let value = "";
      while (end < sql.length) {
        if (sql[end] === char && sql[end + 1] === char) {
          value += char;
          end += 2;
        } else if (sql[end] === char) {
          end += 1;
          break;
        } else {
          value += sql[end];
          end += 1;
        }
      }
      push("string", end, value);
    } else if ((char === "-" && sql[index + 1] === "-") || char === "#") {
      let end = index;
      while (end < sql.length && sql[end] !== "\n") end += 1;
      push("comment", end);
    } else if (/[0-9]/.test(char)) {
      let end = index;
      while (end < sql.length && /[0-9.]/.test(sql[end])) end += 1;
      push("number", end);
    } else if (/[A-Za-z_]/.test(char)) {
      let end = index;
      while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) end += 1;
      push("word", end);
    } else if (char === ";") {
      push("end", index + 1);
    } else if (
      (char === "<" || char === ">" || char === "!") &&
      sql[index + 1] === "="
    ) {
      push("op", index + 2);
    } else if (char === "<" && sql[index + 1] === ">") {
      push("op", index + 2);
    } else {
      push("op", index + 1);
    }
  }
  return result;
}

type SqlValue = string | number | boolean;

class SqlError extends Error {}

function evaluateWhere(tokensIn: Token[], row: User): boolean {
  const list = tokensIn;
  let position = 0;
  const peek = () => list[position];
  const keyword = (word: string) =>
    peek()?.kind === "word" && peek()?.text.toUpperCase() === word;
  const truthy = (value: SqlValue) =>
    value === true || (value !== false && Number(value) !== 0 && value !== "");

  const primary = (): SqlValue => {
    const token = list[position];
    if (!token) throw new SqlError("unexpected end");
    position += 1;
    if (token.kind === "string") return token.value;
    if (token.kind === "number") return Number(token.text);
    if (token.kind === "op" && token.text === "(") {
      const value = or();
      if (list[position]?.text !== ")") throw new SqlError("missing )");
      position += 1;
      return value;
    }
    if (token.kind === "word") {
      const column = token.text.toLowerCase();
      if (column === "name") return row.name;
      if (column === "pass") return row.pass;
      if (column === "role") return row.role;
      if (column === "true") return true;
      if (column === "false") return false;
      throw new SqlError(`unknown column: ${token.text}`);
    }
    throw new SqlError(`near "${token.text}"`);
  };

  const comparison = (): SqlValue => {
    const left = primary();
    const op = peek();
    if (
      op?.kind === "op" &&
      ["=", "<>", "!=", "<", ">", "<=", ">="].includes(op.text)
    ) {
      position += 1;
      const right = primary();
      const numeric =
        !Number.isNaN(Number(left)) && !Number.isNaN(Number(right));
      const a = numeric ? Number(left) : String(left);
      const b = numeric ? Number(right) : String(right);
      switch (op.text) {
        case "=":
          return a === b;
        case "<>":
        case "!=":
          return a !== b;
        case "<":
          return a < b;
        case ">":
          return a > b;
        case "<=":
          return a <= b;
        default:
          return a >= b;
      }
    }
    return left;
  };

  const not = (): SqlValue => {
    if (keyword("NOT")) {
      position += 1;
      return !truthy(not());
    }
    return comparison();
  };

  const and = (): SqlValue => {
    let value = not();
    while (keyword("AND")) {
      position += 1;
      const right = not();
      value = truthy(value) && truthy(right);
    }
    return value;
  };

  function or(): SqlValue {
    let value = and();
    while (keyword("OR")) {
      position += 1;
      const right = and();
      value = truthy(value) || truthy(right);
    }
    return value;
  }

  const result = or();
  if (position < list.length)
    throw new SqlError(`near "${list[position].text}"`);
  return truthy(result);
}

interface SqlOutcome {
  rows: User[];
  error?: string;
  stacked: string[];
}

function runQuery(sql: string): SqlOutcome {
  const all = lex(sql).filter(
    (token) => token.kind !== "space" && token.kind !== "comment",
  );
  const statements: Token[][] = [[]];
  for (const token of all) {
    if (token.kind === "end") statements.push([]);
    else statements.at(-1)?.push(token);
  }
  const [first, ...rest] = statements;
  const stacked = rest
    .filter((statement) => statement.length > 0)
    .map((statement) => statement.map((token) => token.text).join(" "));
  const whereIndex = first.findIndex(
    (token) => token.kind === "word" && token.text.toUpperCase() === "WHERE",
  );
  if (whereIndex === -1) return { rows: [], error: "no WHERE", stacked };
  const condition = first.slice(whereIndex + 1);
  try {
    return {
      rows: USERS.filter((row) => evaluateWhere(condition, row)),
      stacked,
    };
  } catch (error) {
    const message = error instanceof SqlError ? error.message : "error";
    return { rows: [], error: message, stacked };
  }
}

function initSql(lab: HTMLElement): void {
  const user = find<HTMLInputElement>(lab, "[data-sql-user]");
  const pass = find<HTMLInputElement>(lab, "[data-sql-pass]");
  const prepared = find<HTMLInputElement>(lab, "[data-sql-prepared]");
  const query = find<HTMLElement>(lab, "[data-sql-query]");
  const rows = find<HTMLElement>(lab, "[data-sql-rows]");
  const status = find<HTMLElement>(lab, "[data-sql-status]");
  if (!user || !pass || !prepared || !query || !rows || !status) return;
  const presets = presetsOf(
    lab,
    z.object({
      at: z.number(),
      user: z.string(),
      pass: z.string(),
      prepared: z.boolean().optional(),
    }),
  );

  const render = () => {
    const parts: [string, Source][] = prepared.checked
      ? [["SELECT * FROM users\nWHERE name = ? AND pass = ?;", "code"]]
      : [
          ["SELECT * FROM users\nWHERE name = '", "code"],
          [user.value, "user"],
          ["' AND pass = '", "code"],
          [pass.value, "user"],
          ["';", "code"],
        ];
    const sql = parts.map(([text]) => text).join("");
    const sources: Source[] = parts.flatMap(([text, source]) =>
      [...text].map(() => source),
    );
    const lexed = lex(sql);
    query.replaceChildren();
    for (const token of lexed) {
      let run = "";
      let runClass = "";
      const flush = () => {
        if (!run) return;
        const span = document.createElement("span");
        span.className = runClass;
        span.textContent = run;
        query.append(span);
        run = "";
      };
      for (let index = token.start; index < token.end; index += 1) {
        const fromUser = sources[index] === "user";
        let className = `sql-${token.kind}`;
        if (fromUser)
          className += token.kind === "string" ? " sql-data" : " sql-injected";
        if (token.kind === "comment")
          className = fromUser ? "sql-comment sql-injected" : "sql-comment";
        if (className !== runClass) {
          flush();
          runClass = className;
        }
        run += sql[index];
      }
      flush();
    }
    if (prepared.checked) {
      const params = document.createElement("span");
      params.className = "sql-params";
      params.textContent = `\nparams = [${JSON.stringify(user.value)}, ${JSON.stringify(pass.value)}]`;
      query.append(params);
    }

    const outcome: SqlOutcome = prepared.checked
      ? {
          rows: USERS.filter(
            (row) => row.name === user.value && row.pass === pass.value,
          ),
          stacked: [],
        }
      : runQuery(sql);
    rows.replaceChildren(
      ...outcome.rows.map((row) => {
        const tr = document.createElement("tr");
        for (const value of [row.name, row.pass, row.role]) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        return tr;
      }),
    );
    const injected = lexed.some(
      (token) =>
        token.kind !== "string" &&
        token.kind !== "space" &&
        sql
          .slice(token.start, token.end)
          .split("")
          .some((_, offset) => sources[token.start + offset] === "user"),
    );
    let message: string;
    let tone = "ok";
    if (outcome.error) {
      message = `✗ SQL error (${outcome.error}). Showing this error to the client already leaks information.`;
      tone = "warn";
    } else if (outcome.rows.length === 0) {
      message = "login failed: 0 rows";
    } else {
      const [first] = outcome.rows;
      message = `logged in as ${first.name} (${first.role}) · ${outcome.rows.length} row${outcome.rows.length === 1 ? "" : "s"}`;
      if (injected) tone = "bad";
    }
    if (outcome.stacked.length > 0) {
      message += ` · ⚠ second statement: ${outcome.stacked.join("; ")}`;
      tone = "bad";
    }
    if (prepared.checked)
      message += " · the input is always a value, never code";
    status.dataset.tone = tone;
    status.textContent = message;
  };

  for (const field of [user, pass, prepared])
    field.addEventListener("input", render);
  onStep(lab, ({ step }) => {
    const preset = presetAt(presets, step) ?? presets[0];
    if (!preset) return;
    user.value = preset.user;
    pass.value = preset.pass;
    prepared.checked = preset.prepared ?? false;
    render();
  });
  render();
}

// ---------------------------------------------------------------- UIDs

interface Uids {
  ruid: number;
  euid: number;
  suid: number;
}

const INITIAL_UIDS: Uids = { ruid: 1000, euid: 0, suid: 0 };
const uidName = (uid: number) => (uid === 0 ? "0 · root" : `${uid} · rodrigo`);

interface CallResult {
  state: Uids;
  ok: boolean;
}

function applyCall(state: Uids, call: string): CallResult {
  const match = /^(setuid|seteuid)\((\d+)\)$/.exec(call);
  if (!match) return { state, ok: false };
  const target = Number(match[2]);
  const allowed =
    state.euid === 0 || target === state.ruid || target === state.suid;
  if (!allowed) return { state, ok: false };
  if (match[1] === "setuid" && state.euid === 0) {
    return { state: { ruid: target, euid: target, suid: target }, ok: true };
  }
  return { state: { ...state, euid: target }, ok: true };
}

function initUid(lab: HTMLElement): void {
  const status = find<HTMLElement>(lab, "[data-uid-status]");
  const log = find<HTMLElement>(lab, "[data-uid-log]");
  if (!status || !log) return;
  const presets = presetsOf(
    lab,
    z.object({ at: z.number(), ops: z.array(z.string()) }),
  );
  let state = INITIAL_UIDS;
  let history: { call: string; ok: boolean }[] = [];

  const render = () => {
    for (const key of ["ruid", "euid", "suid"] as const) {
      const card = lab.querySelector<HTMLElement>(`[data-uid="${key}"]`);
      const value = card?.querySelector("strong");
      if (!card || !value) continue;
      value.textContent = uidName(state[key]);
      card.dataset.root = String(state[key] === 0);
    }
    const canRegain = state.euid === 0 || state.ruid === 0 || state.suid === 0;
    status.dataset.tone = state.euid === 0 ? "bad" : canRegain ? "warn" : "ok";
    status.textContent =
      state.euid === 0
        ? "running with root privileges"
        : canRegain
          ? "no root now, but it can go back: SUID is still 0"
          : "permanent drop: there is no way back to root";
    log.replaceChildren(
      ...history.map(({ call, ok }) => {
        const item = document.createElement("li");
        item.dataset.ok = String(ok);
        item.textContent = `${call} ${ok ? "✓" : "✗ EPERM"}`;
        return item;
      }),
    );
  };

  const run = (calls: string[]) => {
    state = INITIAL_UIDS;
    history = [];
    for (const call of calls) {
      const result = applyCall(state, call);
      state = result.state;
      history.push({ call, ok: result.ok });
    }
    render();
  };

  lab.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLElement>(
      "[data-uid-call], [data-uid-reset]",
    );
    if (!button) return;
    if (button.dataset.uidCall) {
      const result = applyCall(state, button.dataset.uidCall);
      state = result.state;
      history.push({ call: button.dataset.uidCall, ok: result.ok });
      render();
    } else {
      run([]);
    }
  });
  onStep(lab, ({ step }) => run(presetAt(presets, step)?.ops ?? []));
  render();
}

// ---------------------------------------------------------------- cookies

function initCookie(lab: HTMLElement): void {
  const domain = find<HTMLInputElement>(lab, "[data-cookie-domain]");
  const path = find<HTMLInputElement>(lab, "[data-cookie-path]");
  const url = find<HTMLInputElement>(lab, "[data-cookie-url]");
  const domainCheck = find<HTMLElement>(lab, '[data-cookie-check="domain"]');
  const pathCheck = find<HTMLElement>(lab, '[data-cookie-check="path"]');
  const verdict = find<HTMLElement>(lab, "[data-cookie-verdict]");
  const origin = find<HTMLElement>(lab, "[data-cookie-origin]");
  if (
    !domain ||
    !path ||
    !url ||
    !domainCheck ||
    !pathCheck ||
    !verdict ||
    !origin
  )
    return;
  const presets = presetsOf(
    lab,
    z.object({
      at: z.number(),
      domain: z.string(),
      path: z.string(),
      url: z.string(),
    }),
  );

  const render = () => {
    let parsed: URL | null = null;
    try {
      parsed = new URL(
        /^[a-z]+:\/\//i.test(url.value) ? url.value : `https://${url.value}`,
      );
    } catch {
      parsed = null;
    }
    if (!parsed) {
      verdict.textContent = "Invalid URL";
      verdict.dataset.tone = "warn";
      return;
    }
    const host = parsed.hostname;
    const cookieDomain = domain.value.trim().replace(/^\./, "").toLowerCase();
    const cookiePath = path.value.trim() || "/";
    const requestPath = parsed.pathname || "/";
    const domainOk = host === cookieDomain || host.endsWith(`.${cookieDomain}`);
    const pathOk =
      requestPath === cookiePath ||
      (requestPath.startsWith(cookiePath) &&
        (cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/"));
    domainCheck.dataset.ok = String(domainOk);
    domainCheck.textContent = `${domainOk ? "✓" : "✗"} domain: "${cookieDomain}" ${domainOk ? "is" : "is not"} a suffix of "${host}"`;
    pathCheck.dataset.ok = String(pathOk);
    pathCheck.textContent = `${pathOk ? "✓" : "✗"} path: "${cookiePath}" ${pathOk ? "is" : "is not"} a prefix of "${requestPath}"`;
    const sent = domainOk && pathOk;
    verdict.dataset.tone = sent ? "ok" : "bad";
    verdict.textContent = sent ? "cookie sent" : "cookie not sent";
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    origin.textContent = `the request's SOP origin = (${parsed.protocol.replace(":", "")}, ${host}, ${port})`;
  };

  for (const field of [domain, path, url])
    field.addEventListener("input", render);
  onStep(lab, ({ step }) => {
    const preset = presetAt(presets, step) ?? presets[0];
    if (!preset) return;
    domain.value = preset.domain;
    path.value = preset.path;
    url.value = preset.url;
    render();
  });
  render();
}

const WIDGETS = new Map<string, (element: HTMLElement) => void>(
  Object.entries({
    overflow: initOverflow,
    sql: initSql,
    uid: initUid,
    cookie: initCookie,
  }),
);

export function initWidgets(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-widget]")) {
    if (element.dataset.widgetReady) continue;
    element.dataset.widgetReady = "true";
    WIDGETS.get(element.dataset.widget ?? "")?.(element);
  }
}

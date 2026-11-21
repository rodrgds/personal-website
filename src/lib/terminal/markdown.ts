// A small Markdown renderer for the tty's `ask` answers: headings, lists,
// quotes, rules, fenced code with syntax colours, and inline bold, italic,
// code and links. It builds DOM nodes (never HTML strings), so model output
// cannot inject markup. Answers stream in, so it re-renders the whole text
// each time and closes a marker the next chunk has not closed yet.

export type LinkFactory = (text: string, href: string) => HTMLElement;

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|\b_[^_\s][^_\n]*_\b)|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function inline(text: string, link: LinkFactory): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last)
      nodes.push(document.createTextNode(text.slice(last, start)));
    const [whole, code, bold, italic, label, href] = match;
    if (code) {
      const element = document.createElement("code");
      element.className = "tty-code-inline";
      element.textContent = code.slice(1, -1);
      nodes.push(element);
    } else if (bold) {
      const element = document.createElement("b");
      element.append(...inline(bold.slice(2, -2), link));
      nodes.push(element);
    } else if (italic) {
      const element = document.createElement("i");
      element.append(...inline(italic.slice(1, -1), link));
      nodes.push(element);
    } else if (label && href) {
      nodes.push(link(label, href));
    } else {
      nodes.push(document.createTextNode(whole));
    }
    last = start + whole.length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

// ---------------------------------------------------------------------------
// Code colours

const KEYWORDS = new Set(
  (
    "as async await break case catch class const continue def default defer " +
    "del do elif else enum export extends false finally fn for from func go " +
    "if impl import in inherit instanceof interface let match mod mut new nil " +
    "none null of package pass pub raise rec return self static struct super " +
    "switch then this throw true try type typeof undefined use var void while " +
    "with yield fi esac done echo export local function lambda None True False"
  ).split(" "),
);

/** Languages whose comments start with `#`. */
const HASH_COMMENTS = new Set(
  "sh bash zsh fish shell console py python nix yaml yml toml rb ruby dockerfile conf ini r".split(
    " ",
  ),
);

/** One token at a time: comment, string, number, word, or anything else. */
function tokenPattern(lang: string): RegExp {
  const comment = HASH_COMMENTS.has(lang)
    ? String.raw`#[^\n]*`
    : String.raw`\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`;
  return new RegExp(
    [
      `(${comment})`,
      String.raw`("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|\x60(?:[^\x60\\]|\\.)*\x60?)`,
      String.raw`(\b\d[\d_.]*(?:e[+-]?\d+)?\b|\b0x[\da-f]+\b)`,
      String.raw`([A-Za-z_$][\w$-]*)`,
    ].join("|"),
    "gi",
  );
}

function highlight(code: string, lang: string): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  for (const match of code.matchAll(tokenPattern(lang))) {
    const start = match.index ?? 0;
    if (start > last)
      nodes.push(document.createTextNode(code.slice(last, start)));
    const [whole, comment, string, number, word] = match;
    const next = code.charAt(start + whole.length);
    if (comment) nodes.push(span("tty-dim", whole));
    else if (string) nodes.push(span("tty-str", whole));
    else if (number) nodes.push(span("tty-date", whole));
    else if (word && KEYWORDS.has(word)) nodes.push(span("tty-tag", whole));
    else if (word && next === "(") nodes.push(span("tty-dir", whole));
    else nodes.push(document.createTextNode(whole));
    last = start + whole.length;
  }
  if (last < code.length) nodes.push(document.createTextNode(code.slice(last)));
  return nodes;
}

function codeBlock(code: string, lang: string): HTMLElement {
  const block = document.createElement("div");
  block.className = "tty-code";
  if (lang) block.append(span("tty-code-lang", lang));
  const body = document.createElement("code");
  body.append(...highlight(code, lang.toLowerCase()));
  block.append(body);
  return block;
}

// ---------------------------------------------------------------------------
// Blocks

/** Close a bold or code marker that the stream has not closed yet. */
function closeOpenMarkers(line: string): string {
  let closed = line;
  if ((closed.match(/\*\*/g)?.length ?? 0) % 2 === 1) closed += "**";
  if ((closed.match(/`/g)?.length ?? 0) % 2 === 1) closed += "`";
  return closed;
}

function isBlank(node: Node | undefined): boolean {
  return node instanceof Text && !node.data.trim();
}

export function renderMarkdown(source: string, link: LinkFactory): Node[] {
  const nodes: Node[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  const text = (value: string): void => {
    nodes.push(document.createTextNode(value));
  };
  while (index < lines.length) {
    const raw = lines[index] ?? "";
    const fence = /^\s*(```+|~~~+)\s*([\w+#.-]*)/.exec(raw);
    if (fence) {
      const marker = fence[1] ?? "```";
      const body: string[] = [];
      index += 1;
      while (
        index < lines.length &&
        !(lines[index] ?? "").trim().startsWith(marker)
      ) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      // The block sits on its own lines: drop the blank lines around it.
      while (isBlank(nodes.at(-1))) nodes.pop();
      nodes.push(codeBlock(body.join("\n"), fence[2] ?? ""));
      while (index < lines.length && !(lines[index] ?? "").trim()) index += 1;
      continue;
    }
    const line = closeOpenMarkers(raw);
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
      const element = document.createElement("b");
      element.className = "tty-md-heading";
      element.append(
        span("tty-accent", `${heading[1] ?? "#"} `),
        ...inline(heading[2] ?? "", link),
      );
      nodes.push(element);
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      nodes.push(span("tty-dim", "────────"));
    } else if (bullet) {
      text(bullet[1] ?? "");
      nodes.push(span("tty-accent", "- "), ...inline(bullet[2] ?? "", link));
    } else if (numbered) {
      text(numbered[1] ?? "");
      nodes.push(
        span("tty-accent", `${numbered[2] ?? "1"}. `),
        ...inline(numbered[3] ?? "", link),
      );
    } else if (quote) {
      nodes.push(span("tty-dim", "│ "));
      const element = document.createElement("i");
      element.append(...inline(quote[1] ?? "", link));
      nodes.push(element);
    } else {
      nodes.push(...inline(line, link));
    }
    index += 1;
    if (index < lines.length) text("\n");
  }
  return nodes;
}

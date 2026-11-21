// The virtual file system behind the tty. Built once from /api/tty.json.
import type { TtyData } from "../tty-data";
import {
  aboutText,
  faveText,
  nowText,
  postText,
  projectText,
  socialText,
  usesText,
} from "./content";

export const HOME = "/home/rodrigo";

export interface DirNode {
  kind: "dir";
  children: Map<string, Node>;
  /** The site page this directory belongs to, for `open`. */
  href?: string;
}

export interface FileNode {
  kind: "file";
  content: string;
  href?: string;
  exec?: boolean;
  /** Not printable: `cat` refuses and `open` downloads it. */
  binary?: boolean;
  mtime: string;
  kindLabel: string;
}

export type Node = DirNode | FileNode;

export interface ProgramEntry {
  name: string;
  summary: string;
}

const MTIME = "2026-11-19";

function dir(href?: string): DirNode {
  return { kind: "dir", children: new Map(), href };
}

function file(
  content: string,
  kindLabel: string,
  extra: Partial<Omit<FileNode, "kind" | "content" | "kindLabel">> = {},
): FileNode {
  return { kind: "file", content, kindLabel, mtime: MTIME, ...extra };
}

function ensureDir(parent: DirNode, name: string, href?: string): DirNode {
  const existing = parent.children.get(name);
  if (existing?.kind === "dir") return existing;
  const created = dir(href);
  parent.children.set(name, created);
  return created;
}

export function buildRoot(data: TtyData, programs: ProgramEntry[]): DirNode {
  const root = dir();
  const home = ensureDir(ensureDir(root, "home"), "rodrigo", "/");
  home.children.set(
    "about.txt",
    file(aboutText(data), "ASCII text", { href: "/" }),
  );
  home.children.set(
    ".plan",
    file("building things, mostly in the terminal.\n", "ASCII text"),
  );
  home.children.set(
    "now.md",
    file(nowText(data), "Markdown text", { href: "/#now" }),
  );
  home.children.set(
    "uses.txt",
    file(usesText(data), "ASCII text", { href: "/uses" }),
  );

  const writing = ensureDir(home, "writing");
  for (const post of data.writing) {
    writing.children.set(
      `${post.slug}.md`,
      file(postText(post), "Markdown text", {
        href: post.href,
        mtime: post.date ?? MTIME,
      }),
    );
  }

  const projects = ensureDir(home, "projects", "/cv");
  for (const project of data.projects) {
    projects.children.set(
      `${project.label}.md`,
      file(projectText(project), "Markdown text", {
        href: project.href,
        mtime: project.date ?? MTIME,
      }),
    );
  }

  const faves = ensureDir(home, "faves", "/faves");
  for (const group of data.faves) {
    faves.children.set(
      `${group.group}.txt`,
      file(faveText(group), "UTF-8 text", { href: "/faves" }),
    );
  }

  const socials = ensureDir(home, "socials");
  for (const social of data.socials) {
    socials.children.set(
      social.label,
      file(socialText(social), "ASCII text", { href: social.href }),
    );
  }

  const cv = ensureDir(home, "cv", "/cv");
  for (const pdf of data.cv) {
    cv.children.set(
      `${pdf.label}.pdf`,
      file("", "PDF document", { href: pdf.href, binary: true }),
    );
  }

  const bin = ensureDir(ensureDir(root, "usr"), "bin");
  for (const program of programs) {
    bin.children.set(
      program.name,
      file(`# ${program.name}: ${program.summary}\n`, "ELF 64-bit executable", {
        exec: true,
        binary: true,
      }),
    );
  }

  ensureDir(root, "etc").children.set(
    "motd",
    file(
      "welcome to rgo.pt. type help, or just ask a question about me.\n",
      "ASCII text",
    ),
  );
  return root;
}

function matchesGlob(name: string, pattern: string): boolean {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\" && i + 1 < pattern.length) {
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${source}$`).test(name);
}

function hasWildcard(segment: string): boolean {
  for (let i = 0; i < segment.length; i++) {
    if (segment[i] === "\\") i++;
    else if (segment[i] === "*" || segment[i] === "?") return true;
  }
  return false;
}

function unescapeGlob(segment: string): string {
  return segment.replace(/\\(.)/g, "$1");
}

export class Fs {
  constructor(readonly root: DirNode) {}

  /** Absolute, normalised path for `input` seen from `cwd`. */
  resolve(cwd: string, input: string): string {
    let path = input;
    if (path === "~") path = HOME;
    else if (path.startsWith("~/")) path = `${HOME}/${path.slice(2)}`;
    const joined = path.startsWith("/") ? path : `${cwd}/${path}`;
    const parts: string[] = [];
    for (const part of joined.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return `/${parts.join("/")}`;
  }

  lookup(absolute: string): Node | undefined {
    let node: Node = this.root;
    for (const part of absolute.split("/").filter(Boolean)) {
      if (node.kind !== "dir") return undefined;
      const next = node.children.get(part);
      if (!next) return undefined;
      node = next;
    }
    return node;
  }

  /** `/home/rodrigo/writing` shown as `~/writing`. */
  display(absolute: string): string {
    if (absolute === HOME) return "~";
    if (absolute.startsWith(`${HOME}/`))
      return `~${absolute.slice(HOME.length)}`;
    return absolute;
  }

  /** Sorted child names, hidden files last-skipped unless `all`. */
  names(node: DirNode, all = false): string[] {
    return [...node.children.keys()]
      .filter((name) => all || !name.startsWith("."))
      .sort((a, b) => a.localeCompare(b, "en"));
  }

  /** Expand `*` and `?` in one path pattern. Returns [] when nothing matches. */
  glob(cwd: string, pattern: string): string[] {
    let base = cwd;
    let shown = "";
    let rest = pattern;
    if (pattern === "~" || pattern.startsWith("~/")) {
      base = HOME;
      shown = "~";
      rest = pattern.slice(2);
    } else if (pattern.startsWith("/")) {
      base = "/";
      shown = "/";
      rest = pattern.slice(1);
    }
    const results: string[] = [];
    const walk = (current: string, label: string, segments: string[]): void => {
      if (segments.length === 0) {
        results.push(label);
        return;
      }
      const [segment, ...after] = segments;
      const node = this.lookup(current);
      if (node?.kind !== "dir") return;
      const join = (name: string): string =>
        label === ""
          ? name
          : label.endsWith("/")
            ? `${label}${name}`
            : `${label}/${name}`;
      if (!hasWildcard(segment)) {
        const name = unescapeGlob(segment);
        if (node.children.has(name) || name === "." || name === "..")
          walk(this.resolve(current, name), join(name), after);
        return;
      }
      for (const name of this.names(node, segment.startsWith("."))) {
        if (matchesGlob(name, segment))
          walk(this.resolve(current, name), join(name), after);
      }
    };
    walk(
      base,
      shown,
      rest.split("/").filter((segment) => segment !== ""),
    );
    return results;
  }
}

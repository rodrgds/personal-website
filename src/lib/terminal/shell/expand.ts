// Turns parsed words into argument strings: $VARS, ~ and * globs.
import type { Word } from "./lexer";
import type { Shell } from "./types";
import { HOME } from "./vfs";

function variable(shell: Shell, name: string): string {
  switch (name) {
    case "?":
      return String(shell.status);
    case "HOME":
      return HOME;
    case "USER":
      return "rodrigo";
    case "HOSTNAME":
      return "rgo.pt";
    case "SHELL":
      return "/bin/bash";
    case "PWD":
      return shell.cwd;
    case "OLDPWD":
      return shell.oldCwd;
    default:
      return "";
  }
}

const VARIABLE =
  /\$(?:\{([A-Za-z_?][A-Za-z0-9_]*|\?)\}|([A-Za-z_][A-Za-z0-9_]*|\?))/g;

function expandVariables(shell: Shell, text: string): string {
  return text.replace(VARIABLE, (_match, braced?: string, bare?: string) =>
    variable(shell, braced ?? bare ?? ""),
  );
}

/** Escape glob characters so they match themselves. */
function escapeGlob(text: string): string {
  return text.replace(/[*?\\]/g, "\\$&");
}

export function expandWord(shell: Shell, word: Word): string[] {
  let literal = "";
  let pattern = "";
  let quoted = false;
  word.forEach((segment, index) => {
    let text = segment.text;
    if (segment.quote !== "single") text = expandVariables(shell, text);
    if (segment.quote === "none" && index === 0) {
      if (text === "~" || text.startsWith("~/")) text = HOME + text.slice(1);
    }
    if (segment.quote !== "none") quoted = true;
    literal += text;
    pattern += segment.quote === "none" ? text : escapeGlob(text);
  });
  if (!quoted && literal === "") return [];
  if (/[*?]/.test(pattern.replace(/\\./g, ""))) {
    const matches = shell.fs.glob(shell.cwd, pattern);
    if (matches.length > 0) return matches;
  }
  return [literal];
}

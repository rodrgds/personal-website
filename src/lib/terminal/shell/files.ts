// Navigating and reading the virtual file system.
import { parseOptions } from "./args";
import { writeLine } from "./io";
import type { Out, Tone } from "./io";
import type { Io, Program, Shell } from "./types";
import { HOME } from "./vfs";
import type { DirNode, Node } from "./vfs";

function files(
  name: string,
  summary: string,
  usage: string,
  flags: string[],
  run: Program["run"],
  extra: Partial<Program> = {},
): Program {
  return {
    name,
    group: "files",
    summary,
    usage,
    flags,
    takes: "path",
    run,
    ...extra,
  };
}

function tone(node: Node): Tone | undefined {
  if (node.kind === "dir") return "dir";
  return node.exec ? "exec" : undefined;
}

function suffix(node: Node): string {
  return node.kind === "dir" ? "/" : "";
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function listDir(
  shell: Shell,
  io: Io,
  dirNode: DirNode,
  options: { all: boolean; long: boolean; one: boolean },
): void {
  const names = shell.fs.names(dirNode, options.all);
  if (options.all) names.unshift(".", "..");
  const nodeOf = (name: string): Node =>
    name === "." || name === ".."
      ? dirNode
      : (dirNode.children.get(name) ?? dirNode);
  if (options.long) {
    const sizes = names.map((name) => {
      const node = nodeOf(name);
      return node.kind === "dir" ? 4096 : node.content.length;
    });
    const width = Math.max(1, ...sizes.map((size) => String(size).length));
    io.out.write(
      `total ${Math.ceil(sizes.reduce((a, b) => a + b, 0) / 1024)}\n`,
      "dim",
    );
    names.forEach((name, index) => {
      const node = nodeOf(name);
      const mode =
        node.kind === "dir"
          ? "drwxr-xr-x"
          : node.exec
            ? "-rwxr-xr-x"
            : "-rw-r--r--";
      io.out.write(`${mode} rodrigo ${pad(sizes[index], width)} `, "dim");
      io.out.write(node.kind === "dir" ? "2026-11-19" : node.mtime, "date");
      io.out.write(" ");
      io.out.write(`${name}${suffix(node)}\n`, tone(node));
    });
    return;
  }
  const separator = options.one || !io.live ? "\n" : "  ";
  names.forEach((name, index) => {
    const node = nodeOf(name);
    io.out.write(`${name}${suffix(node)}`, tone(node));
    io.out.write(index === names.length - 1 ? "\n" : separator);
  });
}

const ls = files(
  "ls",
  "list a directory",
  "ls [-lah1] [path...]",
  ["-l", "-a", "-h", "-1"],
  (shell, io) => {
    const options = parseOptions("ls", io.args, "lah1", "", io);
    if (options.invalid) return 2;
    const flags = {
      all: options.flags.has("a"),
      long: options.flags.has("l"),
      one: options.flags.has("1"),
    };
    const targets = options.rest.length > 0 ? options.rest : ["."];
    let status = 0;
    targets.forEach((target, index) => {
      const absolute = shell.fs.resolve(shell.cwd, target);
      const node = shell.fs.lookup(absolute);
      if (!node) {
        writeLine(
          io.err,
          `ls: cannot access '${target}': No such file or directory`,
          "err",
        );
        status = 2;
        return;
      }
      if (node.kind === "file") {
        io.out.write(`${target}\n`, tone(node));
        return;
      }
      if (targets.length > 1) {
        if (index > 0) io.out.write("\n");
        io.out.write(`${target}:\n`);
      }
      listDir(shell, io, node, flags);
    });
    return status;
  },
  { pathsFrom: 0 },
);

const cd = files(
  "cd",
  "change directory",
  "cd [path]   (cd - goes back, cd alone goes home)",
  [],
  (shell, io) => {
    const target = io.args[0] ?? "~";
    const absolute =
      target === "-" ? shell.oldCwd : shell.fs.resolve(shell.cwd, target);
    const node = shell.fs.lookup(absolute);
    if (!node) {
      writeLine(
        io.err,
        `bash: cd: ${target}: No such file or directory`,
        "err",
      );
      return 1;
    }
    if (node.kind !== "dir") {
      writeLine(io.err, `bash: cd: ${target}: Not a directory`, "err");
      return 1;
    }
    if (target === "-") writeLine(io.out, shell.fs.display(absolute));
    shell.oldCwd = shell.cwd;
    shell.cwd = absolute;
    return 0;
  },
  { takes: "dir" },
);

const pwd = files(
  "pwd",
  "print the current directory",
  "pwd",
  [],
  (shell, io) => {
    writeLine(io.out, shell.cwd);
    return 0;
  },
  { takes: "none" },
);

function drawTree(
  out: Out,
  node: DirNode,
  prefix: string,
  counts: { dirs: number; files: number },
  all: boolean,
  shell: Shell,
): void {
  const names = shell.fs.names(node, all);
  names.forEach((name, index) => {
    const child = node.children.get(name);
    if (!child) return;
    const last = index === names.length - 1;
    out.write(`${prefix}${last ? "└── " : "├── "}`, "dim");
    out.write(`${name}\n`, tone(child));
    if (child.kind === "dir") {
      counts.dirs++;
      drawTree(
        out,
        child,
        `${prefix}${last ? "    " : "│   "}`,
        counts,
        all,
        shell,
      );
    } else counts.files++;
  });
}

const tree = files(
  "tree",
  "list directories as a tree",
  "tree [-a] [path]",
  ["-a"],
  (shell, io) => {
    const options = parseOptions("tree", io.args, "a", "", io);
    if (options.invalid) return 2;
    const target = options.rest[0] ?? ".";
    const node = shell.fs.lookup(shell.fs.resolve(shell.cwd, target));
    if (!node) {
      writeLine(io.err, `${target} [error opening dir]`, "err");
      return 2;
    }
    io.out.write(`${target}\n`, tone(node));
    const counts = { dirs: 0, files: 0 };
    if (node.kind === "dir")
      drawTree(io.out, node, "", counts, options.flags.has("a"), shell);
    writeLine(io.out);
    writeLine(
      io.out,
      `${counts.dirs} directories, ${counts.files} files`,
      "dim",
    );
    return 0;
  },
);

const file = files(
  "file",
  "say what kind a file is",
  "file path...",
  [],
  (shell, io) => {
    if (io.args.length === 0) {
      writeLine(io.err, "usage: file path...", "err");
      return 1;
    }
    let status = 0;
    for (const name of io.args) {
      const node = shell.fs.lookup(shell.fs.resolve(shell.cwd, name));
      if (!node) {
        writeLine(
          io.err,
          `${name}: cannot open (No such file or directory)`,
          "err",
        );
        status = 1;
      } else
        writeLine(
          io.out,
          `${name}: ${node.kind === "dir" ? "directory" : node.kindLabel}`,
        );
    }
    return status;
  },
);

const stat = files(
  "stat",
  "show a file's details",
  "stat path...",
  [],
  (shell, io) => {
    let status = 0;
    for (const name of io.args) {
      const node = shell.fs.lookup(shell.fs.resolve(shell.cwd, name));
      if (!node) {
        writeLine(
          io.err,
          `stat: cannot statx '${name}': No such file or directory`,
          "err",
        );
        status = 1;
        continue;
      }
      const size = node.kind === "dir" ? 4096 : node.content.length;
      writeLine(io.out, `  File: ${name}`);
      writeLine(
        io.out,
        `  Size: ${size}\tType: ${node.kind === "dir" ? "directory" : node.kindLabel}`,
      );
      if (node.kind === "file" && node.href)
        writeLine(io.out, `  Link: ${node.href}`);
      if (node.kind === "file") writeLine(io.out, `Modify: ${node.mtime}`);
    }
    return status;
  },
);

/** A page, project, post, social or cv pdf by its short name. */
function findLoose(shell: Shell, target: string): string | undefined {
  const wanted = target.toLowerCase();
  const { data } = shell;
  return (
    data.pages.find((item) => item.label === wanted)?.href ??
    data.projects.find((item) => item.label === wanted)?.href ??
    data.writing.find((item) => item.slug === wanted)?.href ??
    data.socials.find((item) => item.label === wanted)?.href ??
    data.cv.find((item) => `cv-${item.label}` === wanted)?.href
  );
}

const open = files(
  "open",
  "open a path, page or link: open ~/writing/x.md, open cv, open https://...",
  "open <path | page | url>...",
  [],
  (shell, io) => {
    if (io.args.length === 0) {
      writeLine(io.err, "usage: open <path | page | url>", "err");
      return 1;
    }
    let status = 0;
    for (const target of io.args) {
      const node = shell.fs.lookup(shell.fs.resolve(shell.cwd, target));
      const href = /^(https?:|mailto:)/.test(target)
        ? target
        : (node?.href ?? findLoose(shell, target));
      if (!href) {
        writeLine(
          io.err,
          node
            ? `open: ${target}: nothing to open here`
            : `open: ${target}: No such file or directory`,
          "err",
        );
        status = 1;
      } else if (/^https?:/.test(href)) {
        shell.host.openTab(href);
        writeLine(io.out, `opening ${href}`, "dim");
      } else shell.host.go(href);
    }
    return status;
  },
  { takes: "path" },
);

function mutator(name: string, verb: string): Program {
  return files(name, "", `${name} ...`, [], (_shell, io) => {
    const target = io.args.filter((arg) => !arg.startsWith("-"))[0];
    if (!target) {
      writeLine(io.err, `${name}: missing operand`, "err");
      return 1;
    }
    writeLine(
      io.err,
      `${name}: cannot ${verb} '${target}': Read-only file system`,
      "err",
    );
    return 1;
  });
}

const rm = files("rm", "", "rm path", [], (_shell, io) => {
  writeLine(
    io.err,
    io.args.length
      ? "rm: nice try. read-only file system."
      : "rm: missing operand",
    "err",
  );
  return 1;
});

export const FILE_PROGRAMS: Program[] = [
  ls,
  cd,
  pwd,
  tree,
  file,
  stat,
  open,
  rm,
  mutator("touch", "touch"),
  mutator("mkdir", "create directory"),
  mutator("mv", "move"),
  mutator("cp", "create regular file"),
];

export { HOME };

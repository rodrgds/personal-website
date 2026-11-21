// Programs about the site itself: navigation, socials, system and fun.
import { writeLine } from "./io";
import type { Out } from "./io";
import { ask } from "./ask";
import { socialHandle, socialName } from "./content";
import type { Group, Program, Shell } from "./types";
import { HOME } from "./vfs";

const BIRTH = new Date("2006-12-02T00:00:00Z").getTime();
const YEAR_MS = 31_556_952_000;

export const SOCIAL_NAMES = [
  "github",
  "linkedin",
  "x",
  "youtube",
  "mastodon",
  "bluesky",
  "instagram",
  "threads",
] as const;

function age(): string {
  return ((Date.now() - BIRTH) / YEAR_MS).toFixed(8);
}

function site(
  name: string,
  group: Group,
  summary: string,
  usage: string,
  run: Program["run"],
  extra: Partial<Program> = {},
): Program {
  return {
    name,
    group,
    summary,
    usage,
    flags: [],
    takes: "none",
    run,
    ...extra,
  };
}

const KEYS: Array<[string, string]> = [
  ["j k", "scroll down / up"],
  ["d u", "half a page down / up"],
  ["gg G", "top / bottom"],
  ["H L", "back / forward"],
  ["g h", "home   (g c cv, g n now, g u uses, g f faves, g e edu)"],
  ["f F", "link hints (F opens in a new tab)"],
  [": `", "open this terminal"],
  ["tab", "complete (again to cycle), shift+tab back, -> accepts"],
  ["ctrl+c", "stop a running program"],
  ["ctrl+l", "clear the screen"],
  ["esc", "close it"],
];

const GROUPS: Group[] = [
  "navigation",
  "files",
  "text",
  "fun",
  "socials",
  "system",
];

export function usageText(program: Program): string {
  return `${program.name}: ${program.summary || "no description"}\nusage: ${program.usage}`;
}

const help = site(
  "help",
  "system",
  "list the programs and keys",
  "help",
  (shell, io) => {
    writeLine(
      io.out,
      "type a program, `man <program>` for details. anything else is a question about me.",
      "dim",
    );
    for (const group of GROUPS) {
      const members = [...shell.programs.values()].filter(
        (program) => program.group === group && program.summary,
      );
      if (members.length === 0) continue;
      writeLine(io.out);
      writeLine(io.out, group, "accent");
      for (const program of members)
        writeLine(io.out, `  ${program.name.padEnd(10)} ${program.summary}`);
    }
    writeLine(io.out);
    writeLine(io.out, "keys (anywhere on the site)", "accent");
    for (const [keys, what] of KEYS)
      writeLine(io.out, `  ${keys.padEnd(10)} ${what}`);
    writeLine(io.out);
    writeLine(
      io.out,
      "shell: pipes |, ; && ||, quotes, ~ $? $HOME and * globs work.",
      "dim",
    );
    return 0;
  },
);

const man = site(
  "man",
  "system",
  "show how a program works: man ls",
  "man <program>",
  (shell, io) => {
    const name = io.args[0];
    if (!name) {
      writeLine(io.err, "What manual page do you want?", "err");
      return 1;
    }
    const program = shell.programs.get(name);
    if (!program) {
      writeLine(io.err, `No manual entry for ${name}`, "err");
      return 16;
    }
    writeLine(io.out, "NAME", "accent");
    writeLine(
      io.out,
      `  ${program.name} - ${program.summary || "(no description)"}`,
    );
    writeLine(io.out, "USAGE", "accent");
    for (const line of program.usage.split("\n"))
      writeLine(io.out, `  ${line}`);
    if (program.flags.length > 0) {
      writeLine(io.out, "OPTIONS", "accent");
      writeLine(io.out, `  ${program.flags.join(" ")}`);
    }
    return 0;
  },
  { takes: "program" },
);

const which = site(
  "which",
  "system",
  "find a program: which ls",
  "which <program>...",
  (shell, io) => {
    let status = 0;
    for (const name of io.args) {
      if (shell.programs.has(name)) writeLine(io.out, `/usr/bin/${name}`);
      else {
        writeLine(io.err, `which: no ${name} in (/usr/bin)`, "err");
        status = 1;
      }
    }
    return status;
  },
  { takes: "program" },
);

const BUILTINS = new Set([
  "cd",
  "pwd",
  "echo",
  "history",
  "exit",
  "clear",
  "type",
  "help",
]);

const typeProgram = site(
  "type",
  "system",
  "say what a name is: type cd",
  "type <name>...",
  (shell, io) => {
    let status = 0;
    for (const name of io.args) {
      if (BUILTINS.has(name)) writeLine(io.out, `${name} is a shell builtin`);
      else if (shell.programs.has(name))
        writeLine(io.out, `${name} is /usr/bin/${name}`);
      else {
        writeLine(io.err, `bash: type: ${name}: not found`, "err");
        status = 1;
      }
    }
    return status;
  },
  { takes: "program" },
);

const history = site(
  "history",
  "system",
  "previous commands",
  "history",
  (shell, io) => {
    shell.history.forEach((entry, index) =>
      writeLine(io.out, `${String(index + 1).padStart(4)}  ${entry}`),
    );
    return 0;
  },
);

function writeLink(out: Out, text: string, href: string): void {
  out.link(text, href);
  out.write("\n");
}

const whoami = site("whoami", "fun", "who is this", "whoami", (shell, io) => {
  const { about } = shell.data;
  writeLine(io.out, about.name, "big");
  for (const [key, value] of [
    ["born", `${about.born}, 2006`],
    ["age", age()],
    ["work", about.role],
    ["study", about.study],
    ["into", about.into.join(", ")],
    ["offline", about.offline.join(", ")],
    ["mail", about.email],
  ]) {
    writeLine(io.out, `${key.padEnd(9)}${value}`);
  }
  return 0;
});

const neofetch = site(
  "neofetch",
  "fun",
  "system info, but it's me",
  "neofetch",
  (shell, io) => {
    const art = [
      "   ██████   ",
      "  ██    ██  ",
      "  ██    ██  ",
      "  ██████    ",
      "  ██   ██   ",
      "  ██    ██  ",
    ];
    const { about } = shell.data;
    const info = [
      "rodrigo@rgo.pt",
      "--------------",
      "os: porto, portugal",
      `uptime: ${age()} years`,
      `role: ${about.role}`,
      `study: ${about.study}`,
      "editor: zed, neovim",
      "wm: hyprland, aerospace",
      "shell: bash + starship",
      `offline: ${about.offline.join(", ")}`,
    ];
    for (let i = 0; i < Math.max(art.length, info.length); i++) {
      io.out.write((art[i] ?? "").padEnd(14), "accent");
      writeLine(io.out, info[i] ?? "");
    }
    return 0;
  },
);

function pageProgram(name: string, label: string): Program {
  return site(name, "navigation", `open ${label}`, name, (shell, io) => {
    const page = shell.data.pages.find((item) => item.label === name);
    if (!page) {
      writeLine(io.err, `${name}: page not found`, "err");
      return 1;
    }
    shell.host.go(page.href);
    return 0;
  });
}

function shortcut(
  name: string,
  summary: string,
  command: (shell: Shell) => string[],
): Program {
  return site(name, "navigation", summary, name, (shell, io) =>
    shell.run(command(shell), io),
  );
}

const cv = site(
  "cv",
  "navigation",
  "download my cv as pdf: cv | cv compact",
  "cv [profile]",
  (shell, io) => {
    const pdf =
      shell.data.cv.find((item) => item.label === (io.args[0] ?? "default")) ??
      shell.data.cv[0];
    if (!pdf) return 1;
    shell.host.go(pdf.href);
    return 0;
  },
  { takes: "words" },
);

const socials = site(
  "socials",
  "socials",
  "all my accounts",
  "socials",
  (shell, io) => {
    for (const social of shell.data.socials) {
      io.out.write(`${social.label.padEnd(10)} `, "accent");
      io.out.write(`${socialHandle(social).padEnd(16)} `);
      writeLink(io.out, social.href, social.href);
    }
    return 0;
  },
);

function socialProgram(name: string): Program {
  return site(name, "socials", `open my ${name}`, name, (shell, io) => {
    const social = shell.data.socials.find((item) => item.label === name);
    if (!social) {
      writeLine(io.err, `${name}: not available`, "err");
      return 1;
    }
    io.out.write(`${socialName(social)} `, "accent");
    writeLine(io.out, socialHandle(social));
    writeLink(io.out, social.href, social.href);
    shell.host.openTab(social.href);
    return 0;
  });
}

const theme = site(
  "theme",
  "system",
  "theme light | dark | toggle",
  "theme [light|dark|toggle]",
  (shell, io) => {
    writeLine(io.out, `theme: ${shell.host.theme(io.args[0] ?? "toggle")}`);
    return 0;
  },
  { takes: "words" },
);

const sound = site(
  "sound",
  "system",
  "sound on | off",
  "sound [on|off]",
  (shell, io) => {
    writeLine(io.out, `sound: ${shell.host.sound(io.args[0] ?? "")}`);
    return 0;
  },
  { takes: "words" },
);

const mail = site(
  "mail",
  "socials",
  "write me an email",
  "mail",
  (shell, io) => {
    writeLine(io.out, shell.data.about.email);
    shell.host.go(`mailto:${shell.data.about.email}`);
    return 0;
  },
);

const uptime = site(
  "uptime",
  "fun",
  "how long i've been running",
  "uptime",
  (_shell, io) => {
    writeLine(io.out, `up ${age()} years, since 2006-12-02`);
    return 0;
  },
);

const date = site("date", "system", "", "date", (_shell, io) => {
  writeLine(io.out, new Date().toString());
  return 0;
});

const clear = site("clear", "system", "clear the screen", "clear", (shell) => {
  shell.host.clear();
  return 0;
});

const exit = site(
  "exit",
  "system",
  "close the terminal (or press esc)",
  "exit",
  (shell) => {
    shell.host.close();
    return 0;
  },
);

const reboot = site(
  "reboot",
  "system",
  "replay the boot on the home page",
  "reboot",
  (shell) => {
    shell.host.reboot();
    return 0;
  },
);

const forget = site(
  "forget",
  "fun",
  "start a fresh conversation with ask",
  "forget",
  (shell, io) => {
    shell.askHistory.length = 0;
    writeLine(io.out, "ask: conversation cleared.", "dim");
    return 0;
  },
);

const sudo = site("sudo", "system", "", "sudo", (_shell, io) => {
  writeLine(
    io.err,
    "rodrigo is not in the sudoers file. this incident will be reported.",
    "err",
  );
  return 1;
});

const vim = site("vim", "fun", "", "vim", (_shell, io) => {
  writeLine(
    io.out,
    "you're already in it. hjkl works everywhere. :q to leave.",
  );
  return 0;
});

const donut = site("donut", "fun", "", "donut", (shell) => {
  shell.host.donut();
  return 0;
});

const matrix = site("matrix", "fun", "", "matrix", (shell) => {
  shell.host.matrix();
  return 0;
});

const inception = site(
  "inception",
  "fun",
  "go a level deeper, and deeper (esc or kick to wake up)",
  "inception",
  (shell, io) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      writeLine(
        io.err,
        "inception: reduced motion is on, so the dream stays still",
        "err",
      );
      return 1;
    }
    shell.host.inception();
    return 0;
  },
);

const credits = site(
  "credits",
  "system",
  "work by others that the site uses",
  "credits",
  (_shell, io) => {
    io.out.write("3d computer  ", "accent");
    writeLine(
      io.out,
      'the boot\'s pc is based on "Personal Computer" by Juan Foo,',
    );
    writeLine(io.out, "             licensed under CC BY 4.0");
    io.out.write("             ");
    writeLink(
      io.out,
      "sketchfab.com/3d-models/personal-computer-b943e06de72c4b2b9ac6b9d7ca813f8f",
      "https://sketchfab.com/3d-models/personal-computer-b943e06de72c4b2b9ac6b9d7ca813f8f",
    );
    io.out.write("             ");
    writeLink(
      io.out,
      "creativecommons.org/licenses/by/4.0",
      "https://creativecommons.org/licenses/by/4.0/",
    );
    return 0;
  },
);

const trueProgram = site("true", "system", "", "true", () => 0);
const falseProgram = site("false", "system", "", "false", () => 1);

const pages = site(
  "pages",
  "navigation",
  "list the site pages",
  "pages",
  (shell, io) => {
    for (const page of shell.data.pages) {
      io.out.write(`${page.label.padEnd(8)} `, "accent");
      io.out.write(`${(page.note ?? "").padEnd(36)} `, "dim");
      writeLink(io.out, page.href, page.href);
    }
    return 0;
  },
);

export const SITE_PROGRAMS: Program[] = [
  help,
  man,
  which,
  typeProgram,
  history,
  clear,
  exit,
  reboot,
  theme,
  sound,
  date,
  trueProgram,
  falseProgram,
  sudo,
  pages,
  cv,
  mail,
  pageProgram("home", "the home page"),
  pageProgram("edu", "the edu app"),
  pageProgram("slides", "talks and study decks"),
  pageProgram("donate", "support my work"),
  shortcut("now", "what i'm up to: same as cat ~/now.md", () => [
    "cat",
    `${HOME}/now.md`,
  ]),
  shortcut("uses", "apps, services and gear", () => [
    "cat",
    `${HOME}/uses.txt`,
  ]),
  shortcut("faves", "movies, books, podcasts, blogs", (shell) => [
    "cat",
    ...shell.fs.glob(HOME, `${HOME}/faves/*`),
  ]),
  shortcut("projects", "list my projects: same as ls -l ~/projects", () => [
    "ls",
    "-l",
    `${HOME}/projects`,
  ]),
  shortcut("writing", "list my posts: same as ls -l ~/writing", () => [
    "ls",
    "-l",
    `${HOME}/writing`,
  ]),
  socials,
  ...SOCIAL_NAMES.map(socialProgram),
  whoami,
  neofetch,
  uptime,
  ask,
  forget,
  vim,
  donut,
  matrix,
  inception,
  credits,
];

// All programs, and the shell that runs them.
import { writeLine } from "./io";
import { FILE_PROGRAMS } from "./files";
import { aliasFor } from "./run";
import { SITE_PROGRAMS, usageText } from "./site";
import { TEXT_PROGRAMS } from "./text";
import type { AskTurn, Host, Io, Program, Shell } from "./types";
import type { TtyData } from "../tty-data";
import { Fs, HOME, buildRoot } from "./vfs";

export const PROGRAMS: Map<string, Program> = new Map(
  [...FILE_PROGRAMS, ...TEXT_PROGRAMS, ...SITE_PROGRAMS].map((program) => [
    program.name,
    program,
  ]),
);

function programName(command: string): string {
  const match = /^\/usr\/bin\/([^/]+)$/.exec(command);
  return match ? match[1] : command;
}

export function createShell(
  data: TtyData,
  host: Host,
  history: string[],
  askHistory: AskTurn[],
): Shell {
  const fs = new Fs(
    buildRoot(
      data,
      [...PROGRAMS.values()].map(({ name, summary }) => ({ name, summary })),
    ),
  );
  const shell: Shell = {
    data,
    fs,
    cwd: HOME,
    oldCwd: HOME,
    status: 0,
    history,
    askHistory,
    host,
    programs: PROGRAMS,
    async run(argv: string[], io: Io): Promise<number> {
      const [first, ...rest] = argv;
      const alias = aliasFor(first);
      const [name, ...args] = alias
        ? [...alias, ...rest]
        : [programName(first), ...rest];
      const program = PROGRAMS.get(name);
      if (!program) {
        writeLine(io.err, `bash: ${first}: command not found`, "err");
        return 127;
      }
      if (args[0] === "--help" && program.name !== "echo") {
        for (const line of usageText(program).split("\n"))
          writeLine(io.out, line);
        return 0;
      }
      return program.run(shell, { ...io, args });
    },
  };
  return shell;
}

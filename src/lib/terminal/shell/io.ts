// Output sinks for shell programs. A program writes to `out` without knowing
// whether it lands on the screen or in the pipe to the next program.
export type Tone =
  | "dim"
  | "accent"
  | "err"
  | "dir"
  | "exec"
  | "date"
  | "tag"
  | "str"
  | "big";

export interface Out {
  write(text: string, tone?: Tone): void;
  link(text: string, href: string): void;
  /** Replace the block's content with this Markdown, rendered (`ask`). */
  markdown(source: string): void;
  /** Style the whole output block (the `ask` answer gets a left rule). */
  block(kind: "ai"): void;
  finish(): void;
}

export interface BufferOut {
  out: Out;
  text(): string;
}

/** Collects plain text: what a pipe passes on. */
export function bufferOut(): BufferOut {
  let collected = "";
  const out: Out = {
    write(text) {
      collected += text;
    },
    link(text) {
      collected += text;
    },
    markdown(source) {
      collected = source;
    },
    block() {},
    finish() {},
  };
  return { out, text: () => collected };
}

/** Throws everything away: `> /dev/null`. */
export const NULL_OUT: Out = {
  write() {},
  link() {},
  markdown() {},
  block() {},
  finish() {},
};

export function writeLine(out: Out, text = "", tone?: Tone): void {
  out.write(`${text}\n`, tone);
}

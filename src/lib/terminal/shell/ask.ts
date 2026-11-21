// `ask`: the AI that answers about Rodrigo, as a program. Streams to the screen
// as rendered Markdown when it is the last stage (markdown.ts), and is
// buffered as plain text when piped.
import { writeLine } from "./io";
import type { Program } from "./types";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MAX_QUESTION = 500;
const MAX_INPUT = 4000;

export const ASK_SUGGESTIONS = [
  "what is he working on right now?",
  "what does he do at augusta labs?",
  "what has he built?",
  "what is openpost?",
  "what is montra?",
  "where does he study?",
  "what did he win?",
  "what is his tech stack?",
  "what editor and os does he use?",
  "what are his favorite books?",
  "what does he do outside of coding?",
  "how can i contact him?",
];

/** Plain text for a pipe: no emphasis markers or heading hashes. */
function clean(answer: string): string {
  return answer.replace(/\*\*|__|^#+\s*/gm, "");
}

export const ask: Program = {
  name: "ask",
  group: "fun",
  summary:
    "answers questions about me; any line that is not a command goes here",
  usage:
    'ask [question...]   words are joined, quotes are optional\n  cat ~/writing/x.md | ask "summarise this"   piped text is attached',
  flags: [],
  takes: "words",
  async run(shell, io) {
    const question = io.args.join(" ").trim();
    const input = io.stdin?.trim() ?? "";
    if (!question && !input) {
      writeLine(io.err, "usage: ask [question...]", "err");
      for (const suggestion of ASK_SUGGESTIONS.slice(0, 4))
        writeLine(io.err, `  ask "${suggestion}"`, "dim");
      writeLine(io.err, '  cat ~/now.md | ask "one line summary"', "dim");
      return 2;
    }
    const asked = question || "Summarise the attached text.";
    if (asked.length > MAX_QUESTION) {
      writeLine(
        io.err,
        `ask: question is too long (max ${MAX_QUESTION} characters)`,
        "err",
      );
      return 1;
    }

    let frame = 0;
    const spin = window.setInterval(() => {
      shell.host.status(`${SPINNER[frame++ % SPINNER.length]} thinking`);
    }, 90);
    shell.host.status(`${SPINNER[0]} thinking`);
    const stop = (): void => {
      window.clearInterval(spin);
      shell.host.status(null);
    };

    let answer = "";
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: asked,
          history: shell.askHistory.slice(-6),
          input: input ? input.slice(0, MAX_INPUT) : undefined,
        }),
        signal: io.signal,
      });
      if (!response.ok || !response.body) {
        stop();
        writeLine(
          io.err,
          (await response.text()) || "ask failed. try again.",
          "err",
        );
        return 1;
      }
      if (io.live) io.out.block("ai");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!answer) stop();
        answer += decoder.decode(value, { stream: true });
        if (io.live) io.out.markdown(answer.trim());
      }
      stop();
      const final = answer.trim();
      if (!final) {
        writeLine(io.err, "no answer this time. ask again in a moment.", "err");
        return 1;
      }
      if (io.live) io.out.markdown(final);
      else io.out.write(`${clean(final)}\n`);
      shell.askHistory.push(
        { role: "user", content: asked },
        { role: "assistant", content: answer },
      );
      return 0;
    } catch {
      stop();
      if (io.signal.aborted) {
        writeLine(io.err, "^C", "dim");
        return 130;
      }
      writeLine(
        io.err,
        "ask failed. check your connection and try again.",
        "err",
      );
      return 1;
    }
  },
};

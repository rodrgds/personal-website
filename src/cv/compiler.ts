import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function compileTypstToPDF(source: string): Promise<Buffer> {
  const workingDirectory = await mkdtemp(join(tmpdir(), "rgo-cv-"));
  const inputFilePath = join(workingDirectory, "cv.typ");
  const outputFilePath = join(workingDirectory, "cv.pdf");

  try {
    await writeFile(inputFilePath, source, "utf-8");

    await execFileAsync("typst", ["compile", inputFilePath, outputFilePath], {
      timeout: 30_000,
      env: {
        ...process.env,
        TYPST_PACKAGE_CACHE_PATH:
          process.env.TYPST_PACKAGE_CACHE_PATH ??
          `${process.env.HOME}/.cache/typst`,
      },
    });

    return await readFile(outputFilePath);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

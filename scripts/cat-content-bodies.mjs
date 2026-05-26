import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const CONTENT_ROOT = "src/content";
const COLLECTIONS = [
  "education",
  "experience",
  "projects",
  "honors",
  "certifications",
];
const EXTENSIONS = new Set([".md", ".mdx"]);

function stripFrontmatter(content) {
  // if (!content.startsWith("---")) {
  //   return content.trim();
  // }

  // const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);

  // if (!match) {
  //   return content.trim();
  // }

  // return content.slice(match[0].length).trim();
  return content;
}

const files = [];

for (const collection of COLLECTIONS) {
  const directory = join(CONTENT_ROOT, collection);

  if (!existsSync(directory)) {
    continue;
  }

  for (const entry of readdirSync(directory)) {
    if (!EXTENSIONS.has(extname(entry))) {
      continue;
    }

    files.push({
      collection,
      file: join(directory, entry),
    });
  }
}

files.sort((a, b) => {
  const collectionDiff =
    COLLECTIONS.indexOf(a.collection) - COLLECTIONS.indexOf(b.collection);

  if (collectionDiff !== 0) {
    return collectionDiff;
  }

  return a.file.localeCompare(b.file);
});

const bodies = files
  .map(({ file }) => stripFrontmatter(readFileSync(file, "utf8")))
  .filter(Boolean);

process.stdout.write(`${bodies.join("\n\n")}\n`);

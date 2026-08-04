import {
  ACTIVITY_SOURCES,
  SYNC_SOURCES,
  type SyncMode,
  type SyncSource,
} from "../src/lib/personal-data/model";
import { applyPersonalDataSchema } from "../src/lib/personal-data/schema";
import {
  formatSyncResult,
  syncAllPersonalData,
  syncPersonalDataSource,
} from "../src/lib/personal-data/sync";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isSyncSource(value: string): value is SyncSource {
  return SYNC_SOURCES.some((source) => source === value);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "schema") {
    await applyPersonalDataSchema();
    console.log("Directus personal-data schema is current.");
    return;
  }

  if (command === "sync") {
    await applyPersonalDataSchema();
    const requestedSource = option("--source") ?? "all";
    const mode: SyncMode = process.argv.includes("--full")
      ? "full"
      : "incremental";
    const results =
      requestedSource === "all"
        ? await syncAllPersonalData(mode)
        : isSyncSource(requestedSource)
          ? [await syncPersonalDataSource(requestedSource, mode)]
          : [];

    if (results.length === 0) {
      throw new Error(
        `Unknown source '${requestedSource}'. Expected all or ${SYNC_SOURCES.join(", ")}.`,
      );
    }
    for (const result of results) console.log(formatSyncResult(result));
    return;
  }

  console.error(
    [
      "Usage:",
      "  bun run personal-data schema",
      `  bun run personal-data sync --source <all|${SYNC_SOURCES.join("|")}> [--full]`,
      `\nPublic activity metrics: ${ACTIVITY_SOURCES.join(", ")}`,
    ].join("\n"),
  );
  process.exitCode = 2;
}

await main();

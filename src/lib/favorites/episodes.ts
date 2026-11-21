import type { FavoriteEpisode } from "./types";

/** One line per episode for the terminal hover card. */
export function episodeLines(episodes?: FavoriteEpisode[]): string | undefined {
  return episodes
    ?.map(({ number, title, guest }) =>
      [number, title, guest && `(${guest})`].filter(Boolean).join(" "),
    )
    .join("\n");
}

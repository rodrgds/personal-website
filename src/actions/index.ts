import { getGitHubContributions } from "./github";
import { getHevyData } from "./hevy";
import { getLastfmData } from "./lastfm";
import { getTraktData } from "./trakt";

export const server = {
  getGitHubContributions,
  getHevyData,
  getLastfmData,
  getTraktData,
};

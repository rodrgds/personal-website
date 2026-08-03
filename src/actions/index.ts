import { getGitHubContributions } from "./github";
import { getHevyActivity, getHevyData } from "./hevy";
import { getLeetCodeActivity } from "./leetcode";
import { getLastfmData } from "./lastfm";
import { getTraktData } from "./trakt";

export const server = {
  getGitHubContributions,
  getHevyData,
  getHevyActivity,
  getLeetCodeActivity,
  getLastfmData,
  getTraktData,
};

import { getGitHubContributions } from "./github";
import { getHevyActivity, getHevyData } from "./hevy";
import { getLeetCodeActivity } from "./leetcode";
import { getLastfmData } from "./lastfm";

export const server = {
  getGitHubContributions,
  getHevyData,
  getHevyActivity,
  getLeetCodeActivity,
  getLastfmData,
};

import { getHevyData } from "./hevy";
import { getLastfmData } from "./lastfm";
import { getActivityData } from "./personal-data";
import { getWatchHistory } from "./wetrakr";

export const server = {
  getActivityData,
  getHevyData,
  getLastfmData,
  getWatchHistory,
};

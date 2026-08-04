import { getHevyData } from "./hevy";
import { getLastfmData } from "./lastfm";
import { getActivityData } from "./personal-data";

export const server = {
  getActivityData,
  getHevyData,
  getLastfmData,
};

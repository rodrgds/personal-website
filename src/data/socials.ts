export const CONSTANTS = {
  NAME: "Rodrigo Dias",
  EMAIL: "hey@rgo.pt",
  APPOINTMENTS: "https://url.rgo.pt/appointments",
  RESUME: "https://url.rgo.pt/resume",
  LOCATION: { lat: 41.1579, lng: -8.6291 }, // Porto, Portugal
};

export interface Social {
  icon_name: string;
  /** Display name, e.g. "LinkedIn". */
  label: string;
  /** The account as it reads on the service. */
  handle: string;
  url: string;
  /** Primary accounts show in the header and on the home page. */
  primary: boolean;
}

export const SOCIALS: Social[] = [
  {
    icon_name: "github",
    label: "GitHub",
    handle: "rodrgds",
    url: "https://url.rgo.pt/github",
    primary: true,
  },
  {
    icon_name: "linkedin",
    label: "LinkedIn",
    handle: "in/rodrgds",
    url: "https://url.rgo.pt/linkedin",
    primary: true,
  },
  {
    icon_name: "x",
    label: "X",
    handle: "@rodrgds",
    url: "https://url.rgo.pt/x",
    primary: true,
  },
  {
    icon_name: "youtube",
    label: "YouTube",
    handle: "@rodrgds",
    url: "https://url.rgo.pt/youtube",
    primary: false,
  },
  {
    icon_name: "mastodon",
    label: "Mastodon",
    handle: "@rgo@masto.pt",
    url: "https://url.rgo.pt/mastodon",
    primary: false,
  },
  {
    icon_name: "bluesky",
    label: "Bluesky",
    handle: "@rgo.pt",
    url: "https://url.rgo.pt/bluesky",
    primary: false,
  },
  {
    icon_name: "instagram",
    label: "Instagram",
    handle: "@rodrgds",
    url: "https://url.rgo.pt/instagram",
    primary: false,
  },
  {
    icon_name: "threads",
    label: "Threads",
    handle: "@rodrgds",
    url: "https://url.rgo.pt/threads",
    primary: false,
  },
];

export const EXTRA_SOCIALS = [
  // {
  //   icon_name: "nostr",
  //   url: "https://url.rgo.pt/nostr",
  // },
  // {
  //   icon_name: "devto",
  //   url: "https://url.rgo.pt/devto",
  // },
  // {
  //   icon_name: "twitch",
  //   url: "https://url.rgo.pt/twitch",
  // },
  // {
  //   icon_name: "kick",
  //   url: "https://url.rgo.pt/kick",
  // },
  // {
  //   icon_name: "lastfm",
  //   url: "https://url.rgo.pt/music",
  // },
  // {
  //   icon_name: "hevy",
  //   url: "https://url.rgo.pt/hevy",
  // },
  // {
  //   icon_name: "komoot",
  //   url: "https://url.rgo.pt/komoot",
  // },
  // {
  //   icon_name: "leetcode",
  //   url: "https://url.rgo.pt/leetcode",
  // },
  // {
  //   icon_name: "kofi",
  //   url: "https://url.rgo.pt/donate",
  // },
];

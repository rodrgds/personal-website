// Server-side data for the home page. Everything comes from the content
// collections and data files, so home stays in sync with /cv, /uses and
// /faves.
import { getCollection } from "astro:content";
import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import serra from "../../assets/home/life/serra-da-estrela.jpg";
import hudsonYards from "../../assets/home/life/hudson-yards.webp";
import arkPitch from "../../assets/cv/codespring-2026/pitching-2.jpg";
import washington from "../../assets/home/life/washington.jpg";
import newYork from "../../assets/home/life/new-york.jpg";
import suited from "../../assets/home/life/suited.jpg";
import mountainRoad from "../../assets/home/life/mountain-road.webp";
import tecla from "../../assets/cv/tecla-2024/3.jpg";
import portrait from "../../assets/home/portrait.webp";
import eduMap from "../../assets/home/edu.png";
import { getCVCovers } from "../../cv/covers";
import { formatCVDate, getCVCollectionsData } from "../../cv/data";
import {
  formatTimelineDuration,
  getCurrentTimelineEntries,
  type TimelineType,
} from "../../cv/timeline";
import { blackLogos, whiteLogos } from "../../data/white-logos";
import { SOCIALS } from "../../data/socials";
import { loadFavorites } from "../favorites/load";
import { episodeLines } from "../favorites/episodes";
import { isRecent } from "../recent";

export interface HomeLogo {
  src: string;
  /** White marks that need inverting on paper. */
  invertLight: boolean;
  /** Black marks that need inverting on the dark theme. */
  invertDark: boolean;
}

/** One line of now.log: something running right now. */
export interface HomeNowItem {
  id: string;
  type: Pick<TimelineType, "key" | "label">;
  /** Short name and what it is or where, e.g. "FEUP" and "BSc, ...". */
  name: string;
  context: string;
  href: string;
  since: string;
  startDate: string;
  /** How long it has been running, e.g. "2y 3m". */
  age: string;
  logo?: HomeLogo;
  isNew: boolean;
  /** Hover card: the full names, a summary and the first screenshot. */
  peek: {
    title: string;
    meta: string;
    body?: string;
    image?: string;
    label?: string;
  };
}

export interface HomePost {
  id: string;
  title: string;
  href: string;
  date: Date;
  isNew: boolean;
  /** For the hover peek: what it is about and how long it takes. */
  description: string;
  meta: string;
}

export interface HomeTool {
  name: string;
  href: string;
  role: string;
  logo?: HomeLogo;
}

export interface HomeToolGroup {
  title: string;
  items: HomeTool[];
}

export interface HomeFave {
  title: string;
  href?: string;
  image?: string;
  /** Small square icon for lists: a cover, poster or favicon. */
  icon?: string;
  /** Author or year, shown under the title in the hover card. */
  meta?: string;
  comment?: string;
  episodes?: string;
  rating: number;
}

export interface HomeFaveGroup {
  id: string;
  title: string;
  items: HomeFave[];
}

export interface HomeSocial {
  name: string;
  label: string;
  handle: string;
  href: string;
  primary: boolean;
}

/** One photo in the life.exe player. */
export interface HomeLifeFrame {
  label: string;
  caption: string;
  image: {
    src: string;
    alt: string;
    position: string;
  };
}

export interface HomeData {
  now: HomeNowItem[];
  posts: HomePost[];
  uses: HomeToolGroup[];
  faves: HomeFaveGroup[];
  socials: HomeSocial[];
  life: HomeLifeFrame[];
  portrait?: string;
}

const LOGO_FILES = import.meta.glob<ImageMetadata>("../../logos/*.png", {
  eager: true,
  import: "default",
});

function findAsset(
  files: Record<string, ImageMetadata>,
  suffix: string,
): ImageMetadata | undefined {
  const key = Object.keys(files).find((path) => path.endsWith(suffix));
  return key ? files[key] : undefined;
}

async function imageUrl(image: ImageMetadata, width: number): Promise<string> {
  const result = await getImage({
    src: image,
    width: Math.min(width, image.width),
    format: "webp",
  });
  return result.src;
}

async function resolveLogo(
  name: string | undefined,
): Promise<HomeLogo | undefined> {
  if (!name || name.includes("/")) return undefined;
  const file = findAsset(LOGO_FILES, `/${name}.png`);
  if (!file) return undefined;
  return {
    src: await imageUrl(file, 96),
    // SAFETY: the generated lists are literal unions of logo names; checking a
    // plain string against them is the intended use.
    invertLight: (whiteLogos as readonly string[]).includes(name),
    // SAFETY: same generated literal-union list as above.
    invertDark: (blackLogos as readonly string[]).includes(name),
  };
}

interface LifeSource {
  label: string;
  caption: string;
  alt: string;
  file: ImageMetadata;
  position?: string;
}

const LIFE: LifeSource[] = [
  {
    label: "2026",
    caption: "serra da estrela, february",
    alt: "Rodrigo in front of snowy mountains in Serra da Estrela",
    file: serra,
    position: "60% 50%",
  },
  {
    label: "NYC",
    caption: "hudson yards from the river",
    alt: "A helicopter above the Hudson Yards skyline",
    file: hudsonYards,
    position: "48% 50%",
  },
  {
    label: "2026",
    caption: "pitching ark at codespring 2026",
    alt: "Rodrigo pitching Ark at CodeSpring 2026",
    file: arkPitch,
    position: "50% 40%",
  },
  {
    label: "2025",
    caption: "washington, dc",
    alt: "Rodrigo in sunglasses with the US Capitol behind him",
    file: washington,
    position: "50% 61%",
  },
  {
    label: "2025",
    caption: "new york, under the bridge",
    alt: "Rodrigo in sunglasses under a steel bridge in New York",
    file: newYork,
    position: "50% 55%",
  },
  {
    label: "travel",
    caption: "the road through the mountains",
    alt: "A switchback winds through snow-dusted slopes at sunset",
    file: mountainRoad,
  },
  {
    label: "2024",
    caption: "1st place at tecla 2024",
    alt: "The TECLA 2024 winning team with their awards",
    file: tecla,
    position: "50% 35%",
  },
  {
    label: "2026",
    caption: "suited up, september",
    alt: "Rodrigo in a blue suit on a lawn",
    file: suited,
    position: "50% 35%",
  },
];

async function buildLife(): Promise<HomeLifeFrame[]> {
  return Promise.all(
    LIFE.map(async (source) => ({
      label: source.label,
      caption: source.caption,
      image: {
        src: await imageUrl(source.file, 900),
        alt: source.alt,
        position: source.position ?? "50% 40%",
      },
    })),
  );
}

/**
 * Things in now.log that are not CV entries. /edu is the one project the
 * home should always point to.
 */
const EXTRA_NOW: Array<{
  id: string;
  name: string;
  context: string;
  href: string;
  startDate: string;
  logo: string;
  image: ImageMetadata;
  alt: string;
}> = [
  {
    id: "edu",
    name: "edu",
    context: "An evolving map of why higher education falls short.",
    href: "/edu",
    // Began as Uni's Bad (unisbad.com) in September 2025.
    startDate: "2025-09",
    logo: "edu",
    image: eduMap,
    alt: "A section of the rgo.pt/edu map",
  },
];

const USES: Array<{
  title: string;
  items: Array<{ name: string; href: string; role: string; logo: string }>;
}> = [
  {
    title: "Desktop",
    items: [
      {
        name: "NixOS",
        href: "https://nixos.org/",
        role: "desktop and server",
        logo: "nixos",
      },
      {
        name: "Hyprland",
        href: "https://hypr.land/",
        role: "compositor",
        logo: "hyprland",
      },
      {
        name: "Quickshell",
        href: "https://quickshell.org/",
        role: "desktop bar",
        logo: "quickshell",
      },
      {
        name: "macOS",
        href: "https://www.apple.com/macos",
        role: "laptop",
        logo: "macos",
      },
      {
        name: "AeroSpace",
        href: "https://github.com/nikitabobko/AeroSpace",
        role: "tiling",
        logo: "aerospace",
      },
      {
        name: "Vicinae",
        href: "https://www.vicinae.com/",
        role: "launcher, on both",
        logo: "vicinae",
      },
    ],
  },
  {
    title: "Dev",
    items: [
      {
        name: "T3 Code",
        href: "https://t3.codes/",
        role: "coding agents",
        logo: "t3code",
      },
      { name: "Zed", href: "https://zed.dev/", role: "editor", logo: "zed" },
      {
        name: "VS Code",
        href: "https://code.visualstudio.com/",
        role: "editor, again",
        logo: "vscode",
      },
      {
        name: "Ghostty",
        href: "https://ghostty.org/",
        role: "terminal",
        logo: "ghostty",
      },
      {
        name: "bash",
        href: "https://www.gnu.org/software/bash/",
        role: "shell",
        logo: "bash",
      },
      {
        name: "Starship",
        href: "https://starship.rs/",
        role: "prompt",
        logo: "starship",
      },
    ],
  },
  {
    title: "Daily",
    items: [
      {
        name: "Brave",
        href: "https://brave.com/download/",
        role: "browser",
        logo: "brave",
      },
      {
        name: "Typst",
        href: "https://typst.app/",
        role: "documents",
        logo: "typst",
      },
      {
        name: "Excalidraw",
        href: "https://excalidraw.com",
        role: "diagrams",
        logo: "excalidraw",
      },
      {
        name: "macshot",
        href: "https://github.com/sw33tLie/macshot",
        role: "screenshots",
        logo: "macshot",
      },
      {
        name: "Hevy",
        href: "https://hevyapp.com/",
        role: "workouts",
        logo: "hevy",
      },
    ],
  },
  {
    title: "Self-hosted",
    items: [
      {
        name: "Immich",
        href: "https://immich.app/",
        role: "photos",
        logo: "immich",
      },
      {
        name: "Vaultwarden",
        href: "https://github.com/dani-garcia/vaultwarden",
        role: "passwords",
        logo: "vaultwarden",
      },
      {
        name: "Hermes Agent",
        href: "https://hermes-agent.nousresearch.com/",
        role: "personal agent",
        logo: "hermes-agent",
      },
      {
        name: "Tailscale",
        href: "https://tailscale.com/",
        role: "mesh VPN",
        logo: "tailscale",
      },
    ],
  },
];

const FAVE_GROUPS: Array<{ id: string; title: string; count: number }> = [
  { id: "movies", title: "Movies", count: 7 },
  { id: "shows", title: "Shows", count: 6 },
  { id: "podcasts", title: "Podcasts", count: 4 },
  { id: "books", title: "Books", count: 4 },
  { id: "blogs", title: "Blogs", count: 5 },
  { id: "articles", title: "Articles", count: 4 },
  { id: "videos", title: "Videos", count: 4 },
];

/** A blog's favicon, via DuckDuckGo's icon service (no tracking cookies). */
function siteIcon(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
  } catch {
    return undefined;
  }
}

async function buildFaves(): Promise<HomeFaveGroup[]> {
  const sections = await loadFavorites();
  return FAVE_GROUPS.flatMap((group) => {
    const section = sections.find((item) => item.id === group.id);
    if (!section) return [];
    const items = [...section.items]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, group.count)
      .map((item) => ({
        title: item.title,
        href: item.url,
        image: item.image,
        icon: item.image ?? siteIcon(item.url),
        meta: [item.author, item.year].filter(Boolean).join(", ") || undefined,
        comment: item.comment,
        episodes: episodeLines(item.favoriteEpisodes),
        rating: item.rating,
      }));
    return [{ id: group.id, title: group.title, items }];
  });
}

export async function getHomeData(now = new Date()): Promise<HomeData> {
  const cv = await getCVCollectionsData();
  const nowEntries = getCurrentTimelineEntries(cv, now).filter(
    (entry) =>
      entry.category !== "honors" && entry.category !== "certifications",
  );

  const posts = (await getCollection("blog", ({ data }) => !data.draft))
    .sort(
      (a, b) =>
        new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf(),
    )
    .map((post) => {
      const date = new Date(post.data.pubDate);
      const words = (post.body ?? "")
        .replace(/^(import|export) .*$/gm, "")
        .split(/\s+/)
        .filter(Boolean).length;
      const minutes = Math.max(1, Math.round(words / 220));
      return {
        id: post.id,
        title: post.data.title,
        href: `/posts/${post.id}`,
        date,
        isNew: isRecent(date, now),
        description: post.data.description,
        meta: [
          date
            .toLocaleDateString("en-GB", { month: "short", year: "numeric" })
            .toLowerCase(),
          `${minutes} min read`,
          post.data.tags.slice(0, 3).join(", "),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });

  const uses = await Promise.all(
    USES.map(async (group) => ({
      title: group.title,
      items: await Promise.all(
        group.items.map(async (item) => ({
          name: item.name,
          href: item.href,
          role: item.role,
          logo: await resolveLogo(item.logo),
        })),
      ),
    })),
  );

  const covers = await getCVCovers(cv);
  const nowItems: HomeNowItem[] = await Promise.all(
    nowEntries.map(async (entry) => {
      const cover = covers.get(entry.slug);
      return {
        id: entry.id,
        type: { key: entry.type.key, label: entry.type.label },
        name: entry.name,
        context: entry.context,
        href: entry.href,
        since: formatCVDate(entry.startDate),
        startDate: entry.startDate,
        age: formatTimelineDuration(entry.startDate, entry.endDate, now),
        logo: await resolveLogo(entry.visual),
        isNew: isRecent(entry.startDate, now),
        peek: {
          title: entry.title,
          meta: `${entry.subtitle} · since ${formatCVDate(entry.startDate).toLowerCase()}`,
          body: entry.summary,
          image: cover?.src,
          label: cover?.label,
        },
      };
    }),
  );
  for (const extra of EXTRA_NOW) {
    nowItems.push({
      id: extra.id,
      type: { key: "build", label: "project" },
      name: extra.name,
      context: extra.context,
      href: extra.href,
      since: formatCVDate(extra.startDate),
      startDate: extra.startDate,
      age: formatTimelineDuration(extra.startDate, undefined, now),
      logo: await resolveLogo(extra.logo),
      isNew: isRecent(extra.startDate, now),
      peek: {
        title: extra.name,
        meta: `rgo.pt/edu, first as uni's bad · since ${formatCVDate(extra.startDate).toLowerCase()}`,
        body: extra.context,
        image: await imageUrl(extra.image, 720),
        label: `${extra.id}.png`,
      },
    });
  }
  nowItems.sort((a, b) => b.startDate.localeCompare(a.startDate));

  return {
    now: nowItems,
    posts,
    uses,
    faves: await buildFaves(),
    socials: SOCIALS.map((social) => ({
      name: social.icon_name,
      label: social.label,
      handle: social.handle,
      href: social.url,
      primary: social.primary,
    })),
    life: await buildLife(),
    portrait: await imageUrl(portrait, 600),
  };
}

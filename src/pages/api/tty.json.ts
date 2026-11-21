import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getCVCollectionsData } from "../../cv/data";
import { cvProfiles } from "../../cv/profiles";
import { getHomeData } from "../../lib/home/data";
import { isRecent } from "../../lib/recent";
import type { TtyData } from "../../lib/terminal/tty-data";

// Everything the in-page terminal can list, open or print. Built once.
export const prerender = true;

const PAGES: TtyData["pages"] = [
  { label: "home", href: "/", note: "who i am, what i'm doing" },
  { label: "cv", href: "/cv", note: "timeline and every project" },
  { label: "now", href: "/#now", note: "what i'm up to right now" },
  { label: "uses", href: "/uses", note: "apps, services and gear" },
  { label: "faves", href: "/faves", note: "movies, books, podcasts, blogs" },
  { label: "edu", href: "/edu", note: "why higher education is broken" },
  { label: "slides", href: "/slides", note: "talks and study decks" },
  { label: "donate", href: "/donate", note: "support my work" },
];

const BODY_LIMIT = 6000;

/** An MDX post as plain Markdown text: no imports, components or markup tags. */
function postText(source: string, href: string): string {
  const parts = source.split(/(^```[\s\S]*?^```)/gm);
  const text = parts
    .map((part) =>
      part.startsWith("```")
        ? part
        : part
            .replace(/^(import|export)\s.*$/gm, "")
            .replace(/<(style|script)[\s\S]*?<\/\1>/g, "")
            .replace(/<[A-Za-z][^>]*?\/>/gs, "")
            .replace(/<\/?[A-Za-z][^>]*>/g, ""),
    )
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= BODY_LIMIT) return text;
  const cut = text.slice(0, BODY_LIMIT).replace(/\s\S*$/, "");
  return `${cut}\n\n... read the rest at https://rgo.pt${href}`;
}

export const GET: APIRoute = async () => {
  const home = await getHomeData();
  const cv = await getCVCollectionsData();
  const bodies = new Map(
    (await getCollection("blog", ({ data }) => !data.draft)).map((post) => [
      post.id,
      post,
    ]),
  );

  const projects = [...cv.projects]
    .sort((a, b) => b.data.startDate.localeCompare(a.data.startDate))
    .map(({ id, data }) => ({
      label: id,
      href: `/cv/${id}`,
      note: data.tagline ?? data.bullets?.[0] ?? data.name,
      date: data.startDate,
      status: data.endDate ? "done" : data.status,
      name: data.name,
      endDate: data.endDate,
      tags: data.tags,
      bullets: data.bullets ?? [],
      url: data.url,
      repo: data.repo,
      isNew: isRecent(data.startDate),
    }));

  const data: TtyData = {
    about: {
      name: "Rodrigo Dias",
      born: "porto, portugal",
      birthDate: "2006-12-02",
      role: "forward deployed engineer @ augusta labs (part-time, hybrid)",
      study: "informatics and computing engineering @ feup",
      into: [
        "linux",
        "nixos",
        "foss",
        "self-hosting",
        "automation",
        "teaching",
        "space",
      ],
      offline: [
        "lifting",
        "biking",
        "table tennis",
        "badminton",
        "photography",
      ],
      email: "hey@rgo.pt",
    },
    pages: PAGES,
    now: home.now.map((item) => ({
      label: `[${item.type.label}] ${item.name} · ${item.context}`,
      href: item.href,
      date: item.startDate,
      isNew: item.isNew,
    })),
    projects,
    writing: home.posts.map((post) => {
      const entry = bodies.get(post.id);
      return {
        label: post.title,
        href: post.href,
        slug: post.id,
        date: post.date.toISOString().slice(0, 10),
        isNew: post.isNew,
        description: entry?.data.description ?? "",
        tags: entry?.data.tags ?? [],
        body: postText(entry?.body ?? "", post.href),
      };
    }),
    uses: home.uses.map((group) => ({
      group: group.title.toLowerCase(),
      items: group.items.map((tool) => ({
        label: tool.name,
        href: tool.href,
        note: tool.role,
      })),
    })),
    faves: home.faves.map((group) => ({
      group: group.title.toLowerCase(),
      items: group.items.map((item) => ({
        label: item.title,
        href: item.href ?? "/faves",
        note: item.meta,
        rating: item.rating,
        comment: item.comment,
      })),
    })),
    socials: home.socials.map((social) => ({
      label: social.name,
      href: social.href,
      note: `${social.label} ${social.handle}`,
    })),
    cv: Object.entries(cvProfiles).map(([slug, profile]) => ({
      label: slug,
      href: `/cv/${slug}.pdf`,
      note: profile.label,
    })),
  };

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

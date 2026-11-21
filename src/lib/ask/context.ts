// Builds the facts the `ask` command may answer from. Everything comes from the
// site's own content, so the AI only knows what the site already says.
import { getCollection } from "astro:content";
import { getCVCollectionsData } from "../../cv/data";
import { getCurrentTimelineEntries } from "../../cv/timeline";
import { FAVORITES } from "../../data/favorites";
import { SOCIALS } from "../../data/socials";

const BODY_LIMIT = 520;

/** Turn an MDX body into plain sentences: no imports, components or markup. */
function plainText(body: string): string {
  return body
    .replace(/^import .*$/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(body: string): string {
  const text = plainText(body);
  return text.length > BODY_LIMIT
    ? `${text.slice(0, BODY_LIMIT).replace(/\s\S*$/, "")}...`
    : text;
}

function range(start: string, end?: string): string {
  return `${start} to ${end ?? "now"}`;
}

function lines(items: Array<string | undefined>): string {
  return items.filter(Boolean).join("\n");
}

async function build(): Promise<string> {
  const cv = await getCVCollectionsData();
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) =>
      new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf(),
  );

  const current = getCurrentTimelineEntries(cv)
    .filter(
      (entry) =>
        entry.category !== "honors" && entry.category !== "certifications",
    )
    .map(
      (entry) =>
        `- ${entry.title} (${entry.subtitle}), since ${entry.startDate}`,
    );

  const experience = cv.experience
    .sort((a, b) => b.data.startDate.localeCompare(a.data.startDate))
    .map(({ data, body }) =>
      lines([
        `- ${data.role} at ${data.company} (${data.type}, ${data.location}), ${range(data.startDate, data.endDate)}`,
        ...(data.bullets ?? []).map((bullet) => `  * ${bullet}`),
        body ? `  notes: ${excerpt(body)}` : undefined,
      ]),
    );

  const education = cv.education.map(({ data, body }) =>
    lines([
      `- ${data.degree} in ${data.area} at ${data.institution} (${data.location}), ${range(data.startDate, data.endDate)}`,
      ...(data.bullets ?? []).map((bullet) => `  * ${bullet}`),
      body ? `  notes: ${excerpt(body)}` : undefined,
    ]),
  );

  const projects = cv.projects
    .sort((a, b) => b.data.startDate.localeCompare(a.data.startDate))
    .map(({ data, body }) =>
      lines([
        `- ${data.name} (${data.category} project, ${data.endDate ? "finished" : data.status}), ${range(data.startDate, data.endDate)}${data.url ? `, ${data.url}` : ""}`,
        data.tags.length > 0 ? `  stack: ${data.tags.join(", ")}` : undefined,
        ...(data.bullets ?? []).map((bullet) => `  * ${bullet}`),
        body ? `  notes: ${excerpt(body)}` : undefined,
      ]),
    );

  const honors = cv.honors.map(
    ({ data }) =>
      `- ${data.title}, ${data.issuer}, ${data.date}${data.bullets?.[0] ? `: ${data.bullets[0]}` : ""}`,
  );
  const certifications = cv.certifications.map(
    ({ data }) => `- ${data.name}, ${data.issuer}, ${data.issueDate}`,
  );

  const faves = [
    [
      "movies",
      FAVORITES.movies.map((item) => ({
        title: item.label,
        rating: item.rating,
        comment: item.comment,
      })),
    ],
    [
      "shows",
      FAVORITES.shows.map((item) => ({
        title: item.label,
        rating: item.rating,
        comment: item.comment,
      })),
    ],
    ["podcasts", FAVORITES.podcasts],
    ["books", FAVORITES.books],
    ["blogs", FAVORITES.blogs],
  ] as const;
  const faveLines = faves.map(
    ([group, items]) =>
      `${group}: ${[...items]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 8)
        .map(
          (item) =>
            `${item.title} (${item.rating}/5${item.comment ? `, "${item.comment}"` : ""})`,
        )
        .join("; ")}`,
  );

  return `ABOUT
Rodrigo Dias. Born in Porto, Portugal, on 2 December 2006. Self-taught programmer since 14.
Forward Deployed Engineer at Augusta Labs since November 2026. Augusta Labs is an applied AI lab based in Lisbon; his role there is part-time with a hybrid setup.
Studies Informatics and Computing Engineering at FEUP (Faculty of Engineering, University of Porto) since September 2024.
Cares about teaching, learning, web development, Linux, FOSS, self-hosting and minimalism.
Away from computers: lifting, biking, table tennis, badminton, calisthenics, photography, space.
Email: hey@rgo.pt. Website: https://rgo.pt (pages: /cv with one page per entry at /cv/<id>, /uses, /faves, /edu, /slides; the home page shows what he is doing now).
Elsewhere: ${SOCIALS.map((social) => `${social.icon_name} ${social.url}`).join(", ")}.

EXPERIENCE
${experience.join("\n")}

EDUCATION
${education.join("\n")}

PROJECTS
${projects.join("\n")}

HONORS
${honors.join("\n")}

CERTIFICATIONS
${certifications.join("\n")}

WRITING (rgo.pt/posts)
${posts.map((post) => `- ${new Date(post.data.pubDate).toISOString().slice(0, 10)} ${post.data.title}`).join("\n")}

USES
Desktop: NixOS with Hyprland and Quickshell; macOS laptop with nix-darwin and AeroSpace; Brave browser.
Dev: Zed, Neovim, Ghostty, bash with Starship, the Pi coding agent.
Daily: Obsidian, Typst, Syncthing, Excalidraw, Hevy for workouts.
Self-hosted on a Synology NAS and Hetzner: Immich, Jellyfin, n8n, Vaultwarden, AdGuard Home, Umami, Directus, OpenPost; Tailscale mesh VPN.
Builds with SvelteKit, TypeScript, Go, Expo, PostgreSQL and Bun.

FAVORITES
${faveLines.join("\n")}

RIGHT NOW (everything active today)
${current.join("\n")}
- rgo.pt/edu, an evolving map of why higher education falls short and what could replace it
Paused: Unprompted.`;
}

let cached: Promise<string> | null = null;

/** The profile text, built once per server process. */
export function getAskContext(): Promise<string> {
  cached ??= build();
  return cached;
}

// Plain-text renderings of the site data: what `cat` prints for each file.
import type { TtyData, TtyLink } from "../tty-data";

type Post = TtyData["writing"][number];
type Project = TtyData["projects"][number];
type FaveGroup = TtyData["faves"][number];

export function postText(post: Post): string {
  const meta = [post.date, ...post.tags].filter(Boolean).join(" · ");
  return [
    `# ${post.label}`,
    meta,
    "",
    post.description,
    "",
    post.body,
    "",
    `https://rgo.pt${post.href}`,
    "",
  ].join("\n");
}

export function projectText(project: Project): string {
  const dates = `${project.date ?? "?"} to ${project.endDate ?? "now"}`;
  const links = [
    project.url,
    project.repo ? `https://github.com/${project.repo}` : undefined,
    `https://rgo.pt${project.href}`,
  ].filter((link): link is string => Boolean(link));
  return [
    `# ${project.name ?? project.label}`,
    `status: ${project.status}`,
    `dates: ${dates}`,
    "",
    ...project.bullets.map((bullet) => `- ${bullet}`),
    "",
    `tech: ${project.tags.join(", ")}`,
    ...links.map((link) => `link: ${link}`),
    "",
  ].join("\n");
}

export function nowText(data: TtyData): string {
  return [
    "# now",
    "",
    ...data.now.map(
      (item) => `- ${item.label}${item.date ? ` (since ${item.date})` : ""}`,
    ),
    "",
    "more at https://rgo.pt/#now",
    "",
  ].join("\n");
}

export function aboutText(data: TtyData): string {
  const { about } = data;
  return [
    about.name,
    `born:    ${about.born}, ${about.birthDate}`,
    `work:    ${about.role}`,
    `study:   ${about.study}`,
    `into:    ${about.into.join(", ")}`,
    `offline: ${about.offline.join(", ")}`,
    `mail:    ${about.email}`,
    "",
  ].join("\n");
}

export function usesText(data: TtyData): string {
  const lines: string[] = [];
  for (const group of data.uses) {
    lines.push(`# ${group.group}`);
    for (const item of group.items)
      lines.push(`${item.label.padEnd(24)} ${item.note ?? ""}`.trimEnd());
    lines.push("");
  }
  return lines.join("\n");
}

export function faveText(group: FaveGroup): string {
  const lines = [`# ${group.group}`, ""];
  for (const item of group.items) {
    const stars =
      "★".repeat(item.rating) + "☆".repeat(Math.max(0, 5 - item.rating));
    lines.push(`${stars} ${item.label}${item.note ? ` (${item.note})` : ""}`);
    if (item.comment) lines.push(`      ${item.comment}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function socialText(social: TtyLink): string {
  const [name, ...rest] = (social.note ?? social.label).split(" ");
  return `${name}\nhandle: ${rest.join(" ")}\nurl: ${social.href}\n`;
}

/** The account handle from a social's note ("LinkedIn in/rodrgds"). */
export function socialHandle(social: TtyLink): string {
  return (social.note ?? "").split(" ").slice(1).join(" ");
}

export function socialName(social: TtyLink): string {
  return (social.note ?? social.label).split(" ")[0];
}

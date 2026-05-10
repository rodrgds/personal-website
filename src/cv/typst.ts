import type { CVProfile } from "./profiles";
import type { ResolvedCV } from "./types";
import { CV_IDENTITY, CV_SKILLS } from "./constants";
import { formatCVDate } from "./data";

function escapeTypst(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>");
}

function dateRange(startDate: string, endDate?: string): string {
  return `${formatCVDate(startDate)} - ${endDate ? formatCVDate(endDate) : "Present"}`;
}

function normalizeLinkValue(link: string): string {
  return link.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function bulletList(items: string[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `- ${escapeTypst(item)}`).join("\n");
}

function buildEducationSection(entries: ResolvedCV["education"]): string {
  if (entries.length === 0) return "";

  const content = entries
    .map((entry) => {
      const defaultBullets = entry.grade
        ? [`${entry.grade}${entry.gradeNote ? ` - ${entry.gradeNote}` : ""}`]
        : [];
      const lines = entry.bullets.length > 0 ? entry.bullets : defaultBullets;

      return `#edu(
  institution: "${escapeTypst(entry.institution)}",
  dates: "${escapeTypst(dateRange(entry.startDate, entry.endDate))}",
  degree: "${escapeTypst(`${entry.degree} in ${entry.area}`)}",
  location: "${escapeTypst(entry.location)}",
  consistent: true,
)
${bulletList(lines)}`;
    })
    .join("\n\n");

  return `== Education\n\n${content}`;
}

function buildExperienceSection(entries: ResolvedCV["experience"]): string {
  if (entries.length === 0) return "";

  const content = entries
    .map(
      (entry) => `#work(
  title: "${escapeTypst(entry.role)}",
  dates: "${escapeTypst(dateRange(entry.startDate, entry.endDate))}",
  company: "${escapeTypst(entry.company)}",
  location: "${escapeTypst(entry.location)}",
)
${bulletList(entry.bullets)}`,
    )
    .join("\n\n");

  return `== Experience\n\n${content}`;
}

function buildProjectsSection(entries: ResolvedCV["projects"]): string {
  if (entries.length === 0) return "";

  const content = entries
    .map((entry) => {
      const roleValue = entry.role
        ? `  role: "${escapeTypst(entry.role)}",\n`
        : "";
      const urlValue = entry.url
        ? `  url: "${escapeTypst(normalizeLinkValue(entry.url))}",\n`
        : "";

      return `#project(
${roleValue}  name: "${escapeTypst(entry.name)}",
${urlValue}  dates: "${escapeTypst(dateRange(entry.startDate, entry.endDate))}",
)
${bulletList(entry.bullets)}`;
    })
    .join("\n\n");

  return `== Projects\n\n${content}`;
}

function buildHonorsSection(
  honors: ResolvedCV["honors"],
  certifications: ResolvedCV["certifications"],
): string {
  if (honors.length === 0 && certifications.length === 0) return "";

  const honorLines = honors
    .map((item) => {
      const text =
        item.bullets[0] ??
        `${item.title} - ${item.issuer} (${formatCVDate(item.date)})`;
      return `- *${escapeTypst(text)}*`;
    })
    .join("\n");

  const certLine =
    certifications.length > 0
      ? `- ${certifications
          .map(
            (certification) =>
              `*${escapeTypst(certification.name)}* (${formatCVDate(certification.issueDate)})`,
          )
          .join("; ")}`
      : "";

  return `== Honors & Awards\n\n${[honorLines, certLine].filter((line) => line.length > 0).join("\n")}`;
}

function buildSkillsSection(): string {
  return `== Skills

- *Languages*: ${CV_SKILLS.languages.join(", ")}
- *Frameworks & Tools*: ${CV_SKILLS.frameworks.join(", ")}
- *Infrastructure*: ${CV_SKILLS.infrastructure.join(", ")}`;
}

const TEMPLATE = String.raw`#import "@preview/scienceicons:0.1.0": orcid-icon

#let resume(
  author: "",
  role: "",
  author-position: left,
  personal-info-position: left,
  pronouns: "",
  location: "",
  email: "",
  github: "",
  linkedin: "",
  phone: "",
  personal-site: "",
  orcid: "",
  accent-color: black,
  font: "New Computer Modern",
  paper: "us-letter",
  author-font-size: 20pt,
  font-size: 10pt,
  lang: "en",
  body,
) = {
  set document(author: author, title: author)
  set text(font: font, size: font-size, lang: lang, ligatures: false)
  set page(margin: (0.5in), paper: paper)

  show link: underline

  show heading.where(level: 2): it => [
    #pad(top: 0pt, bottom: -10pt, [#smallcaps(it.body)])
    #line(length: 100%, stroke: 1pt)
  ]

  show heading: set text(fill: accent-color)
  show link: set text(fill: accent-color)

  show heading.where(level: 1): it => [
    #set align(author-position)
    #set text(weight: 700, size: author-font-size)
    #it.body
  ]

  [= #(author) #h(1fr) #text(weight: 400, size: 14pt, role)]

  let contact-item(value, prefix: "", link-type: "") = {
    if value != "" {
      if link-type != "" {
        link(link-type + value)[#(prefix + value)]
      } else {
        value
      }
    }
  }

  pad(
    top: 0.25em,
    align(personal-info-position)[
      #{
        let items = (
          contact-item(pronouns),
          contact-item(phone, link-type: "tel:"),
          contact-item(location),
          contact-item(email, link-type: "mailto:"),
          contact-item(github, link-type: "https://"),
          contact-item(linkedin, link-type: "https://"),
          contact-item(personal-site, link-type: "https://"),
          contact-item(orcid, prefix: [#orcid-icon(color: rgb("AECD54"))orcid.org/], link-type: "https://orcid.org/"),
        )
        items.filter(x => x != none).join("  |  ")
      }
    ],
  )

  set par(justify: true)
  body
}

#let generic-two-by-two(
  top-left: "",
  top-right: "",
  bottom-left: "",
  bottom-right: "",
) = {
  [
    #top-left #h(1fr) #top-right \
    #bottom-left #h(1fr) #bottom-right
  ]
}

#let generic-one-by-two(left: "", right: "") = {
  [
    #left #h(1fr) #right
  ]
}

#let dates-helper(start-date: "", end-date: "") = {
  if start-date == "" {
    end-date
  } else {
    start-date + " " + sym.dash.em + " " + end-date
  }
}

#let edu(
  institution: "",
  dates: "",
  degree: "",
  gpa: "",
  location: "",
  consistent: false,
) = {
  if consistent {
    generic-two-by-two(
      top-left: strong(institution),
      top-right: dates,
      bottom-left: emph(degree),
      bottom-right: emph(location),
    )
  } else {
    generic-two-by-two(
      top-left: strong(institution),
      top-right: location,
      bottom-left: emph(degree),
      bottom-right: emph(dates),
    )
  }
}

#let work(title: "", dates: "", company: "", location: "") = {
  generic-two-by-two(
    top-left: strong(title),
    top-right: dates,
    bottom-left: company,
    bottom-right: emph(location),
  )
}

#let project(role: "", name: "", url: "", dates: "") = {
  generic-one-by-two(
    left: {
      if role == "" {
        [*#name* #if url != "" and dates != "" [ (#link("https://" + url)[#url])]]
      } else {
        [*#role*, #name #if url != "" and dates != ""  [ (#link("https://" + url)[#url])]]
      }
    },
    right: {
      if dates == "" and url != "" {
        link("https://" + url)[#url]
      } else {
        dates
      }
    },
  )
}

#let certificates(name: "", issuer: "", url: "", date: "") = {
  [
    *#name*, #issuer
    #if url != "" {
      [ (#link("https://" + url)[#url])]
    }
    #h(1fr) #date
  ]
}

#let extracurriculars(activity: "", dates: "") = {
  generic-one-by-two(left: strong(activity), right: dates)
}
`;

export function generateTypst(profile: CVProfile, cv: ResolvedCV): string {
  const sections = [
    buildEducationSection(cv.education),
    buildExperienceSection(cv.experience),
    buildProjectsSection(cv.projects),
    buildHonorsSection(cv.honors, cv.certifications),
    buildSkillsSection(),
  ]
    .filter((section) => section.length > 0)
    .join("\n\n");

  return `${TEMPLATE}

#show: resume.with(
  author: "${escapeTypst(CV_IDENTITY.author)}",
  role: "${escapeTypst(profile.headline ?? "")}",
  pronouns: "${escapeTypst(CV_IDENTITY.pronouns)}",
  location: "${escapeTypst(CV_IDENTITY.location)}",
  email: "${escapeTypst(CV_IDENTITY.email)}",
  github: "${escapeTypst(normalizeLinkValue(CV_IDENTITY.github))}",
  linkedin: "${escapeTypst(normalizeLinkValue(CV_IDENTITY.linkedin))}",
  personal-site: "${escapeTypst(normalizeLinkValue(CV_IDENTITY.personalSite))}",
  accent-color: rgb("${escapeTypst(CV_IDENTITY.accentColor.replace("#", ""))}"),
  font: "${escapeTypst(CV_IDENTITY.font)}",
  paper: "${escapeTypst(CV_IDENTITY.paper)}",
  author-position: left,
  personal-info-position: left,
  lang: "${escapeTypst(CV_IDENTITY.lang)}",
)

${sections}
`;
}

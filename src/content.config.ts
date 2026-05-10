import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { blueskyLoader } from "./loaders/bluesky";

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.string(),
    tags: z.array(z.string()),
    image: z.string().optional(),
    katex: z.boolean().optional().default(false),
  }),
});

const experienceCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/experience" }),
  schema: z.object({
    company: z.string(),
    role: z.string(),
    type: z.enum([
      "full-time",
      "part-time",
      "internship",
      "contract",
      "self-employed",
      "volunteer",
    ]),
    location: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    url: z.url().optional(),
    logo: z.string().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    bullets: z.array(z.string()).optional(),
    related: z.array(z.string()).optional(),
  }),
});

const projectsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    name: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    url: z.string().optional(),
    repo: z.string().optional(),
    demoVideo: z.url().optional(),
    logo: z.string().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    status: z.enum(["active", "archived", "wip"]).default("active"),
    bullets: z.array(z.string()).optional(),
    cvRole: z.string().optional(),
    related: z.array(z.string()).optional(),
  }),
});

const educationCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/education" }),
  schema: z.object({
    institution: z.string(),
    degree: z.string(),
    area: z.string(),
    location: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    grade: z.string().optional(),
    gradeNote: z.string().optional(),
    url: z.url().optional(),
    logo: z.string().optional(),
    image: z.string().optional(),
    activities: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    bullets: z.array(z.string()).optional(),
    related: z.array(z.string()).optional(),
  }),
});

const certificationsCollection = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/certifications",
  }),
  schema: z.object({
    name: z.string(),
    issuer: z.string(),
    issueDate: z.string(),
    expiryDate: z.string().optional(),
    credentialUrl: z.url().optional(),
    logo: z.string().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    bullets: z.array(z.string()).optional(),
    related: z.array(z.string()).optional(),
  }),
});

const honorsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/honors" }),
  schema: z.object({
    title: z.string(),
    issuer: z.string(),
    date: z.string(),
    association: z.string().optional(),
    url: z.url().optional(),
    logo: z.string().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    bullets: z.array(z.string()).optional(),
    related: z.array(z.string()).optional(),
  }),
});

const toolsCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/tools" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
    status: z.enum(["active", "wip", "archived"]).default("active"),
    fullWidth: z.boolean().optional().default(false),
  }),
});

const episodeSchema = z.object({
  number: z.string().optional(),
  guest: z.string().optional(),
  title: z.string(),
});

const favoritesCollection = defineCollection({
  loader: glob({
    // Only load markdown/mdx files from the favorites folders to avoid picking
    // up the archived YAML backups in _yaml-backup which can create duplicates.
    pattern: "**/*.{md,mdx}",
    base: "./src/content/favorites",
  }),
  schema: z.object({
    title: z.string(),
    type: z.enum([
      "movie",
      "show",
      "podcast",
      "book",
      "blog",
      "article",
      "video",
      "cool",
    ]),
    rating: z.number().min(1).max(5),
    year: z.string().optional(),
    author: z.string().optional(),
    url: z.url().optional(),
    image: z.string().optional(),
    icon: z.string().optional(),
    categories: z.array(z.string()).default([]),
  }),
});

export const collections = {
  blog: blogCollection,
  experience: experienceCollection,
  projects: projectsCollection,
  education: educationCollection,
  certifications: certificationsCollection,
  honors: honorsCollection,
  tools: toolsCollection,
  favorites: favoritesCollection,
  thoughts: defineCollection({
    loader: blueskyLoader({
      repo: "rgo.pt",
      limit: 100,
    }),
  }),
};

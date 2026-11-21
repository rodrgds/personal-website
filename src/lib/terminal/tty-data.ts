// Data the TTY reads from /api/tty.json, shared by the route and the client.
import { z } from "astro/zod";

const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  note: z.string().optional(),
  date: z.string().optional(),
  isNew: z.boolean().optional(),
});

const faveSchema = linkSchema.extend({
  rating: z.number(),
  comment: z.string().optional(),
});

export const ttyDataSchema = z.object({
  about: z.object({
    name: z.string(),
    born: z.string(),
    birthDate: z.string(),
    role: z.string(),
    study: z.string(),
    into: z.array(z.string()),
    offline: z.array(z.string()),
    email: z.string(),
  }),
  pages: z.array(linkSchema),
  now: z.array(linkSchema),
  projects: z.array(
    linkSchema.extend({
      status: z.string(),
      name: z.string().optional(),
      endDate: z.string().optional(),
      tags: z.array(z.string()).default([]),
      bullets: z.array(z.string()).default([]),
      url: z.string().optional(),
      repo: z.string().optional(),
    }),
  ),
  writing: z.array(
    linkSchema.extend({
      slug: z.string(),
      description: z.string().default(""),
      tags: z.array(z.string()).default([]),
      body: z.string().default(""),
    }),
  ),
  uses: z.array(z.object({ group: z.string(), items: z.array(linkSchema) })),
  faves: z.array(z.object({ group: z.string(), items: z.array(faveSchema) })),
  socials: z.array(linkSchema),
  cv: z.array(linkSchema),
});

export type TtyData = z.infer<typeof ttyDataSchema>;
export type TtyLink = z.infer<typeof linkSchema>;

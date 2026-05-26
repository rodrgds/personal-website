import type { CVSectionKey } from "./types";

export interface CVProfile {
  label: string;
  headline?: string;
  identity?: {
    pronouns?: string;
    location?: string;
    githubDisplay?: string;
    linkedinDisplay?: string;
    personalSiteDisplay?: string;
  };
  include?: {
    education?: string[];
    experience?: string[];
    projects?: string[];
    certifications?: string[];
    honors?: string[];
  };
  sectionOrder?: CVSectionKey[];
  sectionTitles?: Partial<Record<CVSectionKey, string>>;
  sortStrategy?: "date-desc" | "alphabetical";
  overrides?: Record<string, string[]>;
  skills?: {
    labels?: {
      frontendProduct?: string;
      backendInfrastructure?: string;
    };
    languages?: string[];
    frontendProduct?: string[];
    backendInfrastructure?: string[];
  };
}

const defaultProfile: CVProfile = {
  label: "Rodrigo Dias - CV",
  headline: "Software Engineer",
  sortStrategy: "date-desc",
};

const compactProfile: CVProfile = {
  label: "Rodrigo Dias - CV (Compact)",
  headline: "Software Engineer & Computer Engineering Student",
  identity: {
    pronouns: "",
    location: "Porto, Portugal",
    githubDisplay: "GitHub",
    linkedinDisplay: "LinkedIn",
    personalSiteDisplay: "rgo.pt",
  },
  include: {
    education: ["feup", "colegio-gaia"],
    experience: ["acm-feup", "necho", "unis-easy", "dias-solutions"],
    projects: [
      "openpost",
      "shift-work-app",
      "the-actual-world",
      "youtube-channel",
    ],
    certifications: ["ef-set"],
    honors: ["tecla-2024", "tecla-2023"],
  },
  sectionOrder: ["education", "honors", "experience", "projects", "skills"],
  sectionTitles: {
    experience: "Selected Experience & Leadership",
    projects: "Selected Projects",
  },
  overrides: {
    "education/feup": [
      "Coursework: Algorithms & Data Structures, Operating Systems, Databases, Computer Architecture",
      "Academic Tutor at Consultório FEUP; produce Portuguese CS/math educational videos for FEUP peers",
    ],
    "education/colegio-gaia": ["Final grade: 19.9/20, top of class"],
    "experience/acm-feup": [
      "Lead a 10+ member team building AI projects and technical workshops; manage infrastructure and roadmap",
    ],
    "experience/unis-easy": [
      "Solo-built an AI-powered study platform from product design to production infrastructure",
      "Implemented course workspaces, materials, notes, AI+RAG chat, exercise solutions, billing, and usage limits",
      "Grew @studywithrocco organically on TikTok to 1,000 followers and 500,000 views through study-tip content",
    ],
    "experience/dias-solutions": [
      "Build client web apps and infrastructure: Linux servers, CI/CD, Docker, Cloudflare, backups, and disaster-recovery flows",
    ],
    "projects/openpost": [
      "Built a self-hosted social media scheduler as a single Go binary with embedded SvelteKit UI and SQLite storage",
      "Used agentic coding to ship five-platform publishing, media management, job queues, and multi-tenant RBAC",
    ],
    "projects/shift-work-app": [
      "Published an offline-first Android app for Portuguese shift workers, reaching 100+ downloads, with scheduling, overtime/night-shift pay logic, municipal holidays, and monthly reports",
    ],
    "projects/the-actual-world": [
      "Built a high-school capstone with Expo/React Native, private posts, maps, real-time chat, Stripe credits, push notifications, and PHP/MySQL admin tooling",
    ],
    "projects/youtube-channel": [
      "Published 15+ Portuguese CS/math explainers for FEUP peers, reaching 8,000+ views across 10+ hours of content",
    ],
    "experience/necho": [
      "Built core features for Cybersecure.pt, a cybersecurity SaaS for Portuguese SMEs: real-time dashboards, assessment workflows, PDF reports, email delivery, RBAC, MFA/WebAuthn, and multi-tenant access control",
      "Implemented authentication, payments, file storage, real-time updates, and admin workflows with Next.js, TypeScript, DrizzleORM, MariaDB, Express.js, Socket.io, Stripe, and AWS S3",
    ],
  },
  skills: {
    labels: {
      frontendProduct: "Product/Frontend",
      backendInfrastructure: "Backend/Infra",
    },
    languages: [
      "TypeScript",
      "Python",
      "SQL",
      "Go",
      "C/C++",
      "Java",
      "PHP",
      "Bash",
    ],
    frontendProduct: [
      "SvelteKit",
      "Next.js",
      "React",
      "React Native",
      "Astro",
      "Tailwind CSS",
    ],
    backendInfrastructure: [
      "Linux",
      "NixOS",
      "Docker/Podman",
      "Cloudflare",
      "PostgreSQL",
      "SQLite",
      "CI/CD",
    ],
  },
};

export const cvProfiles = {
  default: defaultProfile,
  compact: compactProfile,
} as const;

export type CVProfileSlug = keyof typeof cvProfiles;

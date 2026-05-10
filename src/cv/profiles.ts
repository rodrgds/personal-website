export interface CVProfile {
  label: string;
  headline?: string;
  include?: {
    education?: string[];
    experience?: string[];
    projects?: string[];
    certifications?: string[];
    honors?: string[];
  };
  sortStrategy?: "date-desc" | "alphabetical";
  overrides?: Record<string, string[]>;
}

const defaultProfile: CVProfile = {
  label: "Rodrigo Dias - CV",
  headline: "Software Engineer",
  sortStrategy: "date-desc",
};

const compactProfile: CVProfile = {
  label: "Rodrigo Dias - CV (Compact)",
  headline: "Software Engineer",
  include: {
    education: ["feup", "colegio-gaia"],
    experience: [
      "feup-tutor",
      "acm-feup",
      "dias-solutions",
      "unis-easy",
      "necho",
    ],
    projects: [
      "youtube-channel",
      "openpost",
      "the-actual-world",
      "shift-work-app",
    ],
    certifications: [
      "cs50-ai",
      "google-cybersecurity",
      "mit-missing-semester",
      "ef-set",
    ],
    honors: ["tecla-2024", "tecla-2023", "high-school-grade"],
  },
  overrides: {
    "education/colegio-gaia": [
      "Graduated top of class (19.9/20) in IT and Multimedia Technologies track",
    ],
    "experience/unis-easy": [
      "Founded and sole-built an AI-powered study platform: TypeScript, React.js, Node.js, PostgreSQL (Supabase), Docker - zero to launch",
      "Handled product design, full-stack engineering, AI integration, and DevOps entirely independently",
    ],
    "projects/openpost": [
      "Open-source self-hosted social media scheduler: single Go binary + embedded SvelteKit frontend, zero runtime dependencies",
      "Supports X, Mastodon, Bluesky, Threads, LinkedIn; AES-256-GCM token encryption, SQLite job queue, platform adapter pattern",
    ],
  },
};

export const cvProfiles = {
  default: defaultProfile,
  compact: compactProfile,
} as const;

export type CVProfileSlug = keyof typeof cvProfiles;

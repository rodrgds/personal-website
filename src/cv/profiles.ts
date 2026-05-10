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
  headline: "Computer Engineering Student",
  include: {
    education: ["feup", "colegio-gaia"],
    experience: [
      "feup-tutor",
      // "acm-feup",
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
    "education/feup": [],
    "education/colegio-gaia": [],
    "experience/feup-tutor": [
      "Tutor 1st and 2nd-year engineering students in mathematics, physics, and programming",
    ],
    "projects/openpost": [
      "Open-source self-hosted social media scheduler: single Go binary + embedded SvelteKit frontend",
    ],
  },
};

export const cvProfiles = {
  default: defaultProfile,
  compact: compactProfile,
} as const;

export type CVProfileSlug = keyof typeof cvProfiles;

export interface ExperienceData {
  company: string;
  role: string;
  type:
    | "full-time"
    | "part-time"
    | "internship"
    | "contract"
    | "self-employed"
    | "volunteer";
  location: string;
  startDate: string;
  endDate?: string;
  url?: string;
  logo?: string;
  image?: string;
  tags: string[];
  featured: boolean;
  bullets?: string[];
  related?: string[];
}

export interface ProjectData {
  name: string;
  startDate: string;
  endDate?: string;
  url?: string;
  repo?: string;
  demoVideo?: string;
  logo?: string;
  image?: string;
  tags: string[];
  featured: boolean;
  status: "active" | "archived" | "wip";
  cvRole?: string;
  bullets?: string[];
  related?: string[];
}

export interface EducationData {
  institution: string;
  degree: string;
  area: string;
  location: string;
  startDate: string;
  endDate?: string;
  grade?: string;
  gradeNote?: string;
  url?: string;
  logo?: string;
  image?: string;
  activities: string[];
  tags: string[];
  bullets?: string[];
  related?: string[];
}

export interface CertificationData {
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate?: string;
  credentialUrl?: string;
  logo?: string;
  image?: string;
  tags: string[];
  bullets?: string[];
  related?: string[];
}

export interface HonorData {
  title: string;
  issuer: string;
  date: string;
  association?: string;
  url?: string;
  logo?: string;
  image?: string;
  tags: string[];
  bullets?: string[];
  related?: string[];
}

export interface CVCollectionEntry<T> {
  id: string;
  data: T;
  body: string;
}

export interface CVCollectionsData {
  experience: CVCollectionEntry<ExperienceData>[];
  projects: CVCollectionEntry<ProjectData>[];
  education: CVCollectionEntry<EducationData>[];
  certifications: CVCollectionEntry<CertificationData>[];
  honors: CVCollectionEntry<HonorData>[];
}

export interface CVEducation {
  slug: string;
  institution: string;
  degree: string;
  area: string;
  location: string;
  startDate: string;
  endDate?: string;
  grade?: string;
  gradeNote?: string;
  bullets: string[];
  related?: RelatedItem[];
}

export interface CVExperience {
  slug: string;
  company: string;
  role: string;
  type: string;
  location: string;
  startDate: string;
  endDate?: string;
  url?: string;
  tags: string[];
  bullets: string[];
  related?: RelatedItem[];
}

export interface CVProject {
  slug: string;
  name: string;
  startDate: string;
  endDate?: string;
  url?: string;
  repo?: string;
  role?: string;
  status: "active" | "archived" | "wip";
  tags: string[];
  bullets: string[];
  related?: RelatedItem[];
}

export interface CVCertification {
  slug: string;
  name: string;
  issuer: string;
  issueDate: string;
  credentialUrl?: string;
  bullets: string[];
  related?: RelatedItem[];
}

export interface CVHonor {
  slug: string;
  title: string;
  issuer: string;
  date: string;
  bullets: string[];
  related?: RelatedItem[];
}

export interface RelatedItem {
  slug: string;
  title: string;
}

export interface ResolvedCV {
  education: CVEducation[];
  experience: CVExperience[];
  projects: CVProject[];
  certifications: CVCertification[];
  honors: CVHonor[];
}

export type CVSectionKey =
  | "education"
  | "experience"
  | "projects"
  | "honors"
  | "skills";

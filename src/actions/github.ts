import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";

interface GitHubContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface GitHubContributionWeek {
  days: GitHubContributionDay[];
}

interface GitHubContributionsCache {
  contributions: GitHubContributionWeek[];
  totalContributions: number;
  startYear: number;
  cachedAt: number;
}

const githubContributionsCache = new Map<string, GitHubContributionsCache>();
const GITHUB_CACHE_DURATION = 60 * 60 * 1000;
const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

function getGitHubContributionLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

async function fetchGitHubUserCreatedAt(
  username: string,
  token: string,
): Promise<string> {
  const query = `
    query($username: String!) {
      user(login: $username) {
        createdAt
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { username } }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub API error: ${response.status} - ${error}`,
    });
  }

  const data = await response.json();

  if (data.errors) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub GraphQL error: ${data.errors[0].message}`,
    });
  }

  return data.data.user?.createdAt;
}

async function fetchGitHubYearContributions(
  username: string,
  token: string,
  year: number,
): Promise<{ weeks: GitHubContributionWeek[]; total: number }> {
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;

  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { username, from, to },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub API error: ${response.status} - ${error}`,
    });
  }

  const data = await response.json();

  if (data.errors) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub GraphQL error: ${data.errors[0].message}`,
    });
  }

  const calendar =
    data.data.user?.contributionsCollection?.contributionCalendar;

  if (!calendar) {
    return { weeks: [], total: 0 };
  }

  const weeks: GitHubContributionWeek[] = calendar.weeks.map((week: any) => ({
    days: week.contributionDays.map((day: any) => ({
      date: day.date,
      count: day.contributionCount,
      level: getGitHubContributionLevel(day.contributionCount),
    })),
  }));

  return { weeks, total: calendar.totalContributions };
}

async function fetchGitHubAllTimeContributions(
  username: string,
  token: string,
): Promise<{
  contributions: GitHubContributionWeek[];
  totalContributions: number;
  startYear: number;
}> {
  const createdAt = await fetchGitHubUserCreatedAt(username, token);
  const accountCreatedYear = new Date(createdAt).getFullYear();
  const currentYear = new Date().getFullYear();

  const years: number[] = [];
  for (let year = accountCreatedYear; year <= currentYear; year++) {
    years.push(year);
  }

  const results = await Promise.all(
    years.map((year) => fetchGitHubYearContributions(username, token, year)),
  );

  const allWeeks: GitHubContributionWeek[] = [];
  let totalContributions = 0;

  for (const result of results) {
    allWeeks.push(...result.weeks);
    totalContributions += result.total;
  }

  return {
    contributions: allWeeks,
    totalContributions,
    startYear: accountCreatedYear,
  };
}

export const getGitHubContributions = defineAction({
  input: z.object({
    username: z.string().optional().default("rodrgds"),
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (input) => {
    const token = import.meta.env.GITHUB_ACCESS_TOKEN;

    if (!token) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "GitHub token not configured",
      });
    }

    const cacheKey = `github-contributions-${input.username}`;
    const cached = githubContributionsCache.get(cacheKey);

    if (
      !input.forceRefresh &&
      cached &&
      Date.now() - cached.cachedAt < GITHUB_CACHE_DURATION
    ) {
      return {
        contributions: cached.contributions,
        totalContributions: cached.totalContributions,
        startYear: cached.startYear,
        fromCache: true,
        cachedAt: new Date(cached.cachedAt).toISOString(),
      };
    }

    const { contributions, totalContributions, startYear } =
      await fetchGitHubAllTimeContributions(input.username, token);

    githubContributionsCache.set(cacheKey, {
      contributions,
      totalContributions,
      startYear,
      cachedAt: Date.now(),
    });

    return {
      contributions,
      totalContributions,
      startYear,
      fromCache: false,
      cachedAt: new Date().toISOString(),
    };
  },
});

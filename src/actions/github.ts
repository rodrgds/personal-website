import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import { fetchUpstream, parseUpstreamJson } from "../lib/upstream";

interface GitHubContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface GitHubContributionWeek {
  days: GitHubContributionDay[];
}

interface GitHubContributionsData {
  contributions: GitHubContributionWeek[];
  totalContributions: number;
  startYear: number;
}

const GITHUB_CACHE_DURATION = 60 * 60 * 1000;
const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const GITHUB_USERNAME = "rodrgds";
const githubContributionsCache = new SimpleCache<GitHubContributionsData>(
  GITHUB_CACHE_DURATION,
  1,
);

const githubUserResponseSchema = z.object({
  data: z.object({
    user: z.object({ createdAt: z.iso.datetime() }).nullable(),
  }),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const githubContributionsResponseSchema = z.object({
  data: z.object({
    user: z
      .object({
        contributionsCollection: z.object({
          contributionCalendar: z.object({
            totalContributions: z.number().int().nonnegative(),
            weeks: z.array(
              z.object({
                contributionDays: z.array(
                  z.object({
                    date: z.string(),
                    contributionCount: z.number().int().nonnegative(),
                  }),
                ),
              }),
            ),
          }),
        }),
      })
      .nullable(),
  }),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

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

  const response = await fetchUpstream(GITHUB_GRAPHQL_ENDPOINT, {
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

  const data = await parseUpstreamJson(
    response,
    githubUserResponseSchema,
    "GitHub",
  );

  if (data.errors) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub GraphQL error: ${data.errors[0].message}`,
    });
  }

  const createdAt = data.data.user?.createdAt;
  if (!createdAt) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Configured GitHub user was not found",
    });
  }
  return createdAt;
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

  const response = await fetchUpstream(GITHUB_GRAPHQL_ENDPOINT, {
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

  const data = await parseUpstreamJson(
    response,
    githubContributionsResponseSchema,
    "GitHub",
  );

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

  const weeks: GitHubContributionWeek[] = calendar.weeks.map((week) => ({
    days: week.contributionDays.map((day) => ({
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

  const results: Awaited<ReturnType<typeof fetchGitHubYearContributions>>[] =
    [];
  for (let offset = 0; offset < years.length; offset += 3) {
    results.push(
      ...(await Promise.all(
        years
          .slice(offset, offset + 3)
          .map((year) => fetchGitHubYearContributions(username, token, year)),
      )),
    );
  }

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
    username: z.literal(GITHUB_USERNAME).optional().default(GITHUB_USERNAME),
    // Retained for wire compatibility; public callers cannot bypass the cache.
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (_input) => {
    const token = import.meta.env.GITHUB_ACCESS_TOKEN;

    if (!token) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "GitHub token not configured",
      });
    }

    const cacheKey = `github-contributions-${GITHUB_USERNAME}`;
    const cached = githubContributionsCache.get(cacheKey);

    if (cached) {
      return {
        contributions: cached.contributions,
        totalContributions: cached.totalContributions,
        startYear: cached.startYear,
        fromCache: true,
        cachedAt: new Date().toISOString(),
      };
    }

    const { contributions, totalContributions, startYear } =
      await githubContributionsCache.getOrSet(cacheKey, () =>
        fetchGitHubAllTimeContributions(GITHUB_USERNAME, token),
      );

    return {
      contributions,
      totalContributions,
      startYear,
      fromCache: false,
      cachedAt: new Date().toISOString(),
    };
  },
});

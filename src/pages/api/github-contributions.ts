import type { APIRoute } from "astro";

interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface ContributionWeek {
  days: ContributionDay[];
}

interface CachedData {
  contributions: ContributionWeek[];
  totalContributions: number;
  startYear: number;
  cachedAt: number;
}

const cache = new Map<string, CachedData>();
const CACHE_DURATION = 1000 * 60 * 60;

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

async function fetchUserCreatedAt(
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
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  return data.data.user?.createdAt;
}

async function fetchYearContributions(
  username: string,
  token: string,
  year: number,
): Promise<{ weeks: ContributionWeek[]; total: number }> {
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
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  const calendar =
    data.data.user?.contributionsCollection?.contributionCalendar;

  if (!calendar) {
    return { weeks: [], total: 0 };
  }

  const weeks: ContributionWeek[] = calendar.weeks.map((week: any) => ({
    days: week.contributionDays.map((day: any) => ({
      date: day.date,
      count: day.contributionCount,
      level: getLevel(day.contributionCount),
    })),
  }));

  return { weeks, total: calendar.totalContributions };
}

async function fetchAllTimeContributions(
  username: string,
  token: string,
): Promise<{
  contributions: ContributionWeek[];
  totalContributions: number;
  startYear: number;
}> {
  const createdAt = await fetchUserCreatedAt(username, token);
  const accountCreatedYear = new Date(createdAt).getFullYear();
  const currentYear = new Date().getFullYear();

  const years: number[] = [];
  for (let year = accountCreatedYear; year <= currentYear; year++) {
    years.push(year);
  }

  const results = await Promise.all(
    years.map((year) => fetchYearContributions(username, token, year)),
  );

  const allWeeks: ContributionWeek[] = [];
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

async function fetchWithCache(
  username: string,
  token: string,
): Promise<{
  contributions: ContributionWeek[];
  totalContributions: number;
  startYear: number;
  fromCache: boolean;
}> {
  const cacheKey = `github-contributions-${username}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CACHE_DURATION) {
    console.log("[GitHub API] Returning cached data");
    return {
      contributions: cached.contributions,
      totalContributions: cached.totalContributions,
      startYear: cached.startYear,
      fromCache: true,
    };
  }

  console.log("[GitHub API] Fetching fresh data from GitHub");
  const { contributions, totalContributions, startYear } =
    await fetchAllTimeContributions(username, token);

  cache.set(cacheKey, {
    contributions,
    totalContributions,
    startYear,
    cachedAt: Date.now(),
  });

  return { contributions, totalContributions, startYear, fromCache: false };
}

export const GET: APIRoute = async ({ request }) => {
  const token = import.meta.env.GITHUB_ACCESS_TOKEN;

  if (!token) {
    return new Response(
      JSON.stringify({ error: "GitHub token not configured" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      },
    );
  }

  const url = new URL(request.url);
  const username = url.searchParams.get("username") || "rodrgds";

  try {
    const { contributions, totalContributions, startYear, fromCache } =
      await fetchWithCache(username, token);

    return new Response(
      JSON.stringify({
        contributions,
        totalContributions,
        startYear,
        fromCache,
        cachedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
          "X-Cache-Status": fromCache ? "HIT" : "MISS",
        },
      },
    );
  } catch (error) {
    console.error("[GitHub API] Error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to fetch contributions",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      },
    );
  }
};

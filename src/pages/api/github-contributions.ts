import type { APIRoute } from 'astro';

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
  cachedAt: number;
}

// Simple in-memory cache (resets on server restart)
// For production, consider using Redis or a database
const cache = new Map<string, CachedData>();
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

async function fetchGitHubContributions(username: string, token: string): Promise<{ contributions: ContributionWeek[]; totalContributions: number }> {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
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
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { username }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  const calendar = data.data.user.contributionsCollection.contributionCalendar;
  const totalContributions = calendar.totalContributions;
  
  // Transform weeks
  const contributions: ContributionWeek[] = calendar.weeks.map((week: any) => ({
    days: week.contributionDays.map((day: any) => ({
      date: day.date,
      count: day.contributionCount,
      level: getLevel(day.contributionCount)
    }))
  }));

  return { contributions, totalContributions };
}

async function fetchWithCache(username: string, token: string): Promise<{ contributions: ContributionWeek[]; totalContributions: number; fromCache: boolean }> {
  const cacheKey = `github-contributions-${username}`;
  const cached = cache.get(cacheKey);

  // Check if cache is valid
  if (cached && Date.now() - cached.cachedAt < CACHE_DURATION) {
    console.log('[GitHub API] Returning cached data');
    return {
      contributions: cached.contributions,
      totalContributions: cached.totalContributions,
      fromCache: true
    };
  }

  // Fetch fresh data
  console.log('[GitHub API] Fetching fresh data from GitHub');
  const { contributions, totalContributions } = await fetchGitHubContributions(username, token);

  // Store in cache
  cache.set(cacheKey, {
    contributions,
    totalContributions,
    cachedAt: Date.now()
  });

  return { contributions, totalContributions, fromCache: false };
}

export const GET: APIRoute = async ({ request }) => {
  const token = import.meta.env.GITHUB_ACCESS_TOKEN;
  
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'GitHub token not configured' }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
  }

  const url = new URL(request.url);
  const username = url.searchParams.get('username') || 'rodrgds';

  try {
    const { contributions, totalContributions, fromCache } = await fetchWithCache(username, token);

    // Calculate start year from the data
    const firstContribution = contributions[contributions.length - 1]?.days[0]?.date;
    const startYear = firstContribution ? new Date(firstContribution).getFullYear() : new Date().getFullYear();

    return new Response(
      JSON.stringify({
        contributions,
        totalContributions,
        startYear,
        fromCache,
        cachedAt: new Date().toISOString()
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // 1 hour browser cache
          'X-Cache-Status': fromCache ? 'HIT' : 'MISS'
        }
      }
    );
  } catch (error) {
    console.error('[GitHub API] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch contributions',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
  }
};

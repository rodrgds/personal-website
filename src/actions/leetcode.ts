import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";

import { SimpleCache } from "../lib/cache";
import { fetchUpstream, parseUpstreamJson } from "../lib/upstream";
import { buildActivityCalendar } from "./activity";

const LEETCODE_USERNAME = "rodrgds";
const LEETCODE_ENDPOINT = "https://leetcode.com/graphql";
const leetcodeCache = new SimpleCache<LeetCodeResult>(3 * 60 * 60 * 1000, 1);

const leetcodeResponseSchema = z.object({
  data: z.object({
    matchedUser: z
      .object({
        username: z.string(),
        submissionCalendar: z.string().nullable().optional(),
        submitStatsGlobal: z
          .object({
            acSubmissionNum: z.array(
              z.object({
                difficulty: z.string(),
                count: z.number().int().nonnegative(),
              }),
            ),
          })
          .optional(),
      })
      .nullable(),
  }),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

interface LeetCodeResult {
  contributions: ReturnType<typeof buildActivityCalendar>;
  totalSolved: number;
  startYear: number;
}

function parseSubmissionCalendar(calendar: string | null | undefined) {
  if (!calendar) return new Map<string, number>();

  try {
    const entries = Object.entries(
      JSON.parse(calendar) as Record<string, number>,
    );

    return new Map(
      entries.map(([timestamp, count]) => [
        new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
        count,
      ]),
    );
  } catch {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LeetCode returned an invalid submission calendar",
    });
  }
}

export const getLeetCodeActivity = defineAction({
  input: z.object({
    forceRefresh: z.boolean().optional(),
  }),
  handler: async (_input) => {
    const cacheKey = `leetcode-activity-${LEETCODE_USERNAME}`;
    const cached = leetcodeCache.get(cacheKey);
    if (cached) return cached;

    const query = `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          username
          submissionCalendar
          submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
            }
          }
        }
      }
    `;

    const response = await fetchUpstream(LEETCODE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "rgo.pt personal website",
      },
      body: JSON.stringify({
        query,
        variables: { username: LEETCODE_USERNAME },
      }),
    });

    if (!response.ok) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: `LeetCode API error: ${response.status}`,
      });
    }

    const data = await parseUpstreamJson(
      response,
      leetcodeResponseSchema,
      "LeetCode",
    );

    if (data.errors?.length) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: `LeetCode GraphQL error: ${data.errors[0].message}`,
      });
    }

    const user = data.data.matchedUser;
    if (!user) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Configured LeetCode user was not found",
      });
    }

    const dailyCounts = parseSubmissionCalendar(user.submissionCalendar);
    const firstDate = [...dailyCounts.keys()].sort()[0];
    const startYear = firstDate
      ? new Date(`${firstDate}T00:00:00Z`).getUTCFullYear()
      : new Date().getFullYear();
    const totalSolved =
      user.submitStatsGlobal?.acSubmissionNum.find(
        (entry) => entry.difficulty === "All",
      )?.count ?? 0;

    const result = {
      contributions: buildActivityCalendar(dailyCounts, startYear, [1, 3, 5]),
      totalSolved,
      startYear,
    } satisfies LeetCodeResult;

    leetcodeCache.set(cacheKey, result);
    return result;
  },
});

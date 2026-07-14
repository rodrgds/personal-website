import { ActionError } from "astro:actions";
import type { z } from "astro/zod";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchUpstream(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Upstream request timed out after ${timeoutMs / 1_000}s`,
      });
    }
    throw error;
  }
}

export async function parseUpstreamJson<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
  provider: string,
): Promise<z.infer<TSchema>> {
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    console.error(`${provider} returned an invalid response`, parsed.error);
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `${provider} returned an invalid response`,
    });
  }
  return parsed.data;
}

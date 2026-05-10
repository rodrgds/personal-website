import type { Loader } from "astro:loaders";
import { z } from "astro/zod";

export function blueskyLoader(options: {
  repo: string;
  limit?: number;
  endpoint?: string;
}): Loader {
  const endpoint = options.endpoint ?? "https://public.api.bsky.app";
  const limit = options.limit ?? 100;

  return {
    name: "bluesky-loader",
    load: async ({
      store,
      logger,
    }: {
      store: {
        set: (entry: { id: string; data: any }) => void;
        clear: () => void;
      };
      logger: {
        info: (message: string) => void;
        warn: (message: string) => void;
        error: (message: string) => void;
      };
    }) => {
      try {
        logger.info(`Fetching Bluesky posts for ${options.repo}`);

        const response = await fetch(
          `${endpoint}/xrpc/app.bsky.feed.getAuthorFeed?actor=${options.repo}&limit=${limit}`,
          {
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();
        const feedItems = data.feed ?? [];

        logger.info(`Received ${feedItems.length} feed items`);

        store.clear();

        for (const item of feedItems) {
          try {
            const post = item.post;
            if (!post?.uri || !post?.cid) {
              logger.warn(`Skipping post missing uri/cid`);
              continue;
            }

            const entry = {
              id: post.cid,
              data: {
                uri: post.uri,
                cid: post.cid,
                text: post.record?.text ?? "",
                createdAt: post.record?.createdAt ?? "",
                author: {
                  did: post.author?.did ?? "",
                  handle: post.author?.handle ?? "",
                  displayName: post.author?.displayName,
                  avatar: post.author?.avatar,
                },
                embed: post.embed
                  ? {
                      type: post.embed.$type,
                      images: post.embed.images,
                      external: post.embed.external,
                    }
                  : undefined,
                likeCount: post.likeCount,
                replyCount: post.replyCount,
                repostCount: post.repostCount,
                isReply: !!post.record?.reply,
                indexedAt: post.indexedAt,
              },
            };

            store.set(entry);
          } catch (parseError) {
            logger.warn(`Skipped invalid post: ${parseError}`);
          }
        }

        logger.info(`Loaded ${feedItems.length} Bluesky posts`);
      } catch (error) {
        logger.error(`Bluesky loader error: ${error}`);
        throw error;
      }
    },
    schema: z.object({
      uri: z.string(),
      cid: z.string(),
      text: z.string(),
      createdAt: z.string(),
      author: z.object({
        did: z.string(),
        handle: z.string(),
        displayName: z.string().optional(),
        avatar: z.string().optional(),
      }),
      embed: z
        .object({
          type: z.string(),
          images: z
            .array(
              z.object({
                image: z.string(),
                alt: z.string().optional(),
              }),
            )
            .optional(),
          external: z
            .object({
              uri: z.string(),
              title: z.string().optional(),
              description: z.string().optional(),
              thumb: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      likeCount: z.number().optional(),
      replyCount: z.number().optional(),
      repostCount: z.number().optional(),
      isReply: z.boolean().optional(),
    }),
  };
}

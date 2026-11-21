import type { Loader } from "astro/loaders";
import { z } from "astro/zod";

/** One picture as the Bluesky app view sends it. */
const imageView = z.object({
  thumb: z.string(),
  fullsize: z.string(),
  alt: z.string().optional(),
});

/** Media on a post: images, a video, or either inside a quote post. */
const mediaView = z.object({
  $type: z.string(),
  images: z.array(imageView).optional(),
  thumbnail: z.string().optional(),
  alt: z.string().optional(),
});

const embedView = mediaView.extend({
  external: z
    .object({
      uri: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      thumb: z.string().optional(),
    })
    .optional(),
  media: mediaView.optional(),
});

const picture = z.object({
  thumb: z.string(),
  fullsize: z.string(),
  alt: z.string().optional(),
  video: z.boolean().optional(),
});

/** A stored post's pictures; collection data arrives untyped. */
export const blueskyPictures = z.array(picture);

type Picture = z.infer<typeof picture>;

function picturesOf(media: z.infer<typeof mediaView>): Picture[] | undefined {
  if (media.images?.length) return media.images;
  if (media.thumbnail) {
    return [
      {
        thumb: media.thumbnail,
        fullsize: media.thumbnail,
        alt: media.alt,
        video: true,
      },
    ];
  }
  return undefined;
}

/** The post's embed, already parsed with `embedView`. */
function embedOf(view: z.infer<typeof embedView>) {
  return {
    type: view.$type,
    images: picturesOf(view.media ?? view),
    external: view.external,
  };
}

export function blueskyLoader(options: {
  repo: string;
  limit?: number;
  endpoint?: string;
}): Loader {
  const endpoint = options.endpoint ?? "https://public.api.bsky.app";
  const limit = options.limit ?? 100;

  return {
    name: "bluesky-loader",
    load: async ({ store, logger }) => {
      try {
        logger.info(`Fetching Bluesky posts for ${options.repo}`);

        const response = await fetch(
          `${endpoint}/xrpc/app.bsky.feed.getAuthorFeed?actor=${options.repo}&limit=${limit}`,
          {
            signal: AbortSignal.timeout(10_000),
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

            // Parse the embed at the API boundary; unknown kinds drop out.
            const embed = embedView.safeParse(post.embed);
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
                embed: embed.success ? embedOf(embed.data) : undefined,
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
        logger.warn(
          `Bluesky loader unavailable; retaining the last successful snapshot: ${error}`,
        );
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
          images: z.array(picture).optional(),
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

# Favorite images

This directory contains cover images for favorites that do not have an external
metadata provider. `src/data/favorites.ts` refers to them as
`/images/favorites/<file>`; `src/lib/favorites/load.ts` resolves that name here
and serves a resized WebP, so the originals can be any size.

Movie and TV posters are loaded from TMDB using the IDs in
`src/data/favorites.ts`; do not add those posters here.

## Image guidelines

- Podcast covers should use a 1:1 aspect ratio.
- Book covers should use a 3:4 aspect ratio.
- Use high-quality images that are at least 300px wide.
- Prefer WebP or AVIF and optimize images for the web.
- Make sure you have the right to use each image.

If an image is unavailable, the favorite's configured icon is displayed.

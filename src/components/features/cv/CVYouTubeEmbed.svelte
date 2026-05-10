<script lang="ts">
  interface Props {
    url: string;
    title: string;
    buttonLabel?: string;
  }

  let {
    url,
    title,
    buttonLabel = "Play walkthrough",
  }: Props = $props();

  let isLoaded = $state(false);
  let thumbnailIndex = $state(0);

  function getVideoId(videoUrl: string): string | null {
    try {
      const parsedUrl = new URL(videoUrl);

      if (parsedUrl.hostname.includes("youtu.be")) {
        return parsedUrl.pathname.replace(/^\/+/, "") || null;
      }

      if (parsedUrl.hostname.includes("youtube.com")) {
        return parsedUrl.searchParams.get("v");
      }
    } catch {
      return null;
    }

    return null;
  }

  const videoId = $derived(getVideoId(url));
  const thumbnailUrls = $derived(
    videoId
      ? [
          `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        ]
      : [],
  );
  const thumbnailUrl = $derived(thumbnailUrls[thumbnailIndex] ?? null);
  const embedUrl = $derived(
    videoId
      ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
      : null,
  );

  function loadVideo(): void {
    isLoaded = true;
  }

  function handleThumbnailError(): void {
    if (thumbnailIndex < thumbnailUrls.length - 1) {
      thumbnailIndex += 1;
    }
  }
</script>

{#if videoId && embedUrl && thumbnailUrl}
  <div class="video-shell">
    {#if isLoaded}
      <iframe
        src={embedUrl}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    {:else}
      <button
        type="button"
        class="video-poster"
        aria-label={`${buttonLabel}: ${title}`}
        onclick={loadVideo}
      >
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          onerror={handleThumbnailError}
        />
        <span class="play-badge">{buttonLabel}</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .video-shell {
    margin: 1rem 0;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--background-color) 92%,
      var(--link-color) 8%
    );
    aspect-ratio: 16 / 9;
  }

  .video-poster {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    overflow: hidden;
    cursor: pointer;
    background: #000;
  }

  .video-poster img,
  iframe {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
  }

  .video-poster img {
    object-fit: cover;
    object-position: center;
  }

  .play-badge {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    padding: 0.45rem 0.8rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    font-size: 0.85rem;
    font-family: var(--font-family-mono);
  }

  .video-poster:hover .play-badge,
  .video-poster:focus-visible .play-badge {
    background: var(--link-color);
    color: var(--background-color);
  }
</style>

<script lang="ts">
  interface Post {
    text: string;
    date: string;
    url: string;
  }

  let { posts, initialIndex = 0 }: { posts: Post[]; initialIndex?: number } =
    $props();

  let currentIndex = $state(0);

  $effect.pre(() => {
    currentIndex = initialIndex;
  });

  function shuffle() {
    if (posts.length <= 1) return;
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * posts.length);
    } while (newIndex === currentIndex && posts.length > 1);
    currentIndex = newIndex;
  }
</script>

{#if posts.length > 0}
  <div class="bluesky-thought">
    <div class="thought-header">
      <span class="label">Random thought</span>
      <button
        class="shuffle-btn"
        onclick={shuffle}
        title="Pick another random post"
      >
        🎲
      </button>
    </div>
    <p class="thought-text">{posts[currentIndex].text}</p>
    <div class="thought-footer">
      <span class="date">{posts[currentIndex].date}</span>
      <a
        href={posts[currentIndex].url}
        target="_blank"
        rel="noopener noreferrer"
        class="view-on-bsky"
      >
        View on Bluesky →
      </a>
    </div>
  </div>
{/if}

<style>
  .bluesky-thought {
    margin-top: 1.5rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 0.5rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .thought-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .label {
    font-size: 0.7rem;
    color: var(--text-color);
    opacity: 0.5;
  }

  .shuffle-btn {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    color: var(--link-color);
    padding: 0;
    line-height: 1;
  }

  .shuffle-btn:hover {
    opacity: 0.7;
  }

  .thought-text {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: var(--text-color);
    line-height: 1.5;
  }

  .thought-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .date {
    font-size: 0.7rem;
    color: var(--text-color);
    opacity: 0.5;
  }

  .view-on-bsky {
    font-size: 0.75rem;
    color: var(--link-color);
    text-decoration: none;
  }

  @media (prefers-color-scheme: dark) {
    .bluesky-thought {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }
  }
</style>

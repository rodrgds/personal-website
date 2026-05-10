<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  interface Props {
    summary: Snippet;
    details: Snippet;
    class?: string;
  }

  let {
    summary,
    details,
    class: className = "",
  }: Props = $props();

  let isMobile = $state(false);
  let isExpanded = $state(false);
  let containerRef: HTMLElement | null = $state(null);

  function detectMobile() {
    isMobile = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }

  function handleOutsideClick(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      isExpanded = false;
    }
  }

  function handleItemClick(event: MouseEvent) {
    // Don't expand if clicking on a link or button inside
    if (
      event.target instanceof Element &&
      (event.target.closest("a") || event.target.closest("button"))
    ) {
      return;
    }
    // Only handle clicks on mobile
    if (isMobile) {
      isExpanded = !isExpanded;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleItemClick(event as unknown as MouseEvent);
    }
  }

  onMount(() => {
    detectMobile();
    window.addEventListener("resize", detectMobile);
    document.addEventListener("click", handleOutsideClick);

    return () => {
      window.removeEventListener("resize", detectMobile);
      document.removeEventListener("click", handleOutsideClick);
    };
  });
</script>

<div
  bind:this={containerRef}
  class="expandable-card {className}"
  class:expanded={isExpanded}
  onclick={handleItemClick}
  role="button"
  tabindex="0"
  onkeydown={handleKeydown}
>
  <div class="expandable-summary">
    {@render summary()}
  </div>

  <div class="expandable-details">
    {@render details()}
  </div>
</div>

<style>
  .expandable-card {
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    background: var(--background-color);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5rem;
    transition: all 0.2s ease;
    cursor: pointer;
    text-align: left;
  }

  .expandable-card:hover,
  .expandable-card.expanded {
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-color: var(--link-color);
  }

  .expandable-summary {
    width: 100%;
  }

  .expandable-details {
    opacity: 0;
    visibility: hidden;
    max-height: 0;
    overflow: hidden;
    transition: all 0.2s ease;
    width: 100%;
  }

  /* Desktop hover behavior */
  @media (hover: hover) and (pointer: fine) {
    .expandable-card:hover .expandable-details {
      opacity: 1;
      visibility: visible;
      max-height: 50rem; /* arbitrarily large to allow content to flow */
      margin-top: 0.5rem;
    }
  }

  /* Mobile click behavior */
  @media (hover: none) and (pointer: coarse) {
    .expandable-card.expanded .expandable-details {
      opacity: 1;
      visibility: visible;
      max-height: 50rem;
      margin-top: 0.5rem;
    }
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .expandable-card {
      border-color: rgba(255, 255, 255, 0.1);
    }

    .expandable-card:hover,
    .expandable-card.expanded {
      border-color: var(--link-color);
    }
  }
</style>

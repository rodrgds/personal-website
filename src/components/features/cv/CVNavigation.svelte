<script lang="ts">
  import { onMount } from "svelte";
  import {
    CV_EXPANDABLE_OPEN_EVENT,
    getAllExpandableIds,
    getHashTarget,
    requestExpandableOpen,
    type CVExpandableOpenDetail,
  } from "./navigation";

  let expandedId: string | null = $state(null);
  let allExpandableIds: string[] = [];

  let isFirst = $state(true);
  let isLast = $state(true);

  function updateButtonStates(): void {
    if (!expandedId || allExpandableIds.length === 0) {
      isFirst = true;
      isLast = true;
      return;
    }

    const currentIndex = allExpandableIds.indexOf(expandedId);
    isFirst = currentIndex <= 0;
    isLast = currentIndex === allExpandableIds.length - 1;
  }

  function syncExpandedIdFromHash(): void {
    const hashTarget = getHashTarget();
    expandedId =
      hashTarget && allExpandableIds.includes(hashTarget) ? hashTarget : null;
    updateButtonStates();
  }

  function goToOffset(offset: -1 | 1): void {
    if (!expandedId || allExpandableIds.length === 0) return;

    const currentIndex = allExpandableIds.indexOf(expandedId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= allExpandableIds.length) return;

    requestExpandableOpen({ id: allExpandableIds[nextIndex] });
  }

  onMount(() => {
    allExpandableIds = getAllExpandableIds();
    syncExpandedIdFromHash();

    const handleExpandedChange = (e: Event) => {
      const event = e as CustomEvent<CVExpandableOpenDetail>;
      expandedId = event.detail.id;
      updateButtonStates();
    };

    const handleHashChange = () => {
      syncExpandedIdFromHash();
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (!expandedId || allExpandableIds.length === 0) return;

      const currentIndex = allExpandableIds.indexOf(expandedId);
      if (currentIndex === -1) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goToOffset(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToOffset(-1);
      }
    };

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href?.startsWith("#")) return;

      const targetId = href.slice(1);
      if (!allExpandableIds.includes(targetId)) return;

      e.preventDefault();
      requestExpandableOpen({ id: targetId });
    };

    window.addEventListener(CV_EXPANDABLE_OPEN_EVENT, handleExpandedChange);
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleDocumentClick);

    return () => {
      window.removeEventListener(CV_EXPANDABLE_OPEN_EVENT, handleExpandedChange);
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("click", handleDocumentClick);
    };
  });

  function goNext(): void {
    goToOffset(1);
  }

  function goPrev(): void {
    goToOffset(-1);
  }
</script>

<!-- Left Button -->
<button
  class="nav-button nav-button-left"
  class:hidden={isFirst}
  onclick={goPrev}
  title="Previous (← or ↑)"
  aria-label="Go to previous CV entry"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
</button>

<!-- Right Button -->
<button
  class="nav-button nav-button-right"
  class:hidden={isLast}
  onclick={goNext}
  title="Next (→ or ↓)"
  aria-label="Go to next CV entry"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
</button>

<style>
  .nav-button {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 100;
    width: 44px;
    height: 44px;
    padding: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gray-color);
    transition:
      background-color 0.16s ease,
      color 0.16s ease,
      border-color 0.16s ease,
      opacity 0.16s ease;
    opacity: 0;
    pointer-events: none;
  }

  .nav-button:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--heading-color);
    border-color: var(--link-color);
  }

  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .nav-button.hidden {
    display: none;
  }

  .nav-button svg {
    width: 20px;
    height: 20px;
  }

  .nav-button-left {
    left: 12px;
  }

  .nav-button-right {
    right: 12px;
  }

  /* Show buttons only on desktop with enough space */
  @media (min-width: 1200px) {
    .nav-button {
      opacity: 0.6;
      pointer-events: auto;
    }

    .nav-button:hover:not(:disabled) {
      opacity: 1;
    }
  }

</style>

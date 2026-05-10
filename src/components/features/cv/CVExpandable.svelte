<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade, slide } from "svelte/transition";
  import { onMount, tick } from "svelte";
  import {
    CV_EXPANDABLE_OPEN_EVENT,
    CV_EXPANDABLE_REQUEST_EVENT,
    getHashTarget,
    requestExpandableOpen,
    scrollExpandableIntoViewImmediately,
    type CVExpandableOpenDetail,
    type CVExpandableRequestDetail,
  } from "./navigation";

  interface Props {
    summary: Snippet;
    details: Snippet;
    class?: string;
    id?: string;
  }

  let {
    summary,
    details,
    class: className = "",
    id: elementId = "",
    ...rest
  }: Props = $props();

  let isExpanded = $state(false);

  const broadcastExpanded = (id: string | null): void => {
    window.dispatchEvent(
      new CustomEvent<CVExpandableOpenDetail>(CV_EXPANDABLE_OPEN_EVENT, {
        detail: { id },
      }),
    );
  };

  async function openSelf(): Promise<void> {
    if (isExpanded) return;

    isExpanded = true;
    await tick();
    broadcastExpanded(elementId);
  }

  function closeSelf(): void {
    if (!isExpanded) return;
    isExpanded = false;
  }

  onMount(() => {
    if (getHashTarget() === elementId) {
      void openSelf();
      scrollExpandableIntoViewImmediately(elementId);
    }

    const handleOtherExpanded = (e: Event) => {
      const event = e as CustomEvent<CVExpandableOpenDetail>;
      if (event.detail.id !== elementId) {
        closeSelf();
      }
    };

    const handleOpenRequest = (e: Event) => {
      const event = e as CustomEvent<CVExpandableRequestDetail>;
      if (event.detail.id === elementId) {
        void openSelf();
        return;
      }

      closeSelf();
    };

    const handleHashChange = () => {
      if (getHashTarget() === elementId) {
        void openSelf();
        scrollExpandableIntoViewImmediately(elementId);
        return;
      }

      closeSelf();
    };

    window.addEventListener(CV_EXPANDABLE_OPEN_EVENT, handleOtherExpanded);
    window.addEventListener(CV_EXPANDABLE_REQUEST_EVENT, handleOpenRequest);
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener(CV_EXPANDABLE_OPEN_EVENT, handleOtherExpanded);
      window.removeEventListener(CV_EXPANDABLE_REQUEST_EVENT, handleOpenRequest);
      window.removeEventListener("hashchange", handleHashChange);
    };
  });

  function handleItemClick(event: MouseEvent): void {
    if (
      event.target instanceof Element &&
      (event.target.closest("a") || event.target.closest("button"))
    ) {
      return;
    }

    if (isExpanded) {
      closeSelf();
      broadcastExpanded(null);
      return;
    }

    requestExpandableOpen({ id: elementId });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isExpanded) {
        closeSelf();
        broadcastExpanded(null);
        return;
      }

      requestExpandableOpen({ id: elementId });
    }
  }
</script>

<div
  data-expandable-id={elementId}
  class="expandable-card {className}"
  class:expanded={isExpanded}
  onclick={handleItemClick}
  role="button"
  tabindex="0"
  onkeydown={handleKeydown}
  {...rest}
>
  <div class="expandable-summary">
    {@render summary()}
  </div>

  {#if isExpanded}
    <div class="expandable-details" transition:slide={{ duration: 200 }}>
      <div
        class="details-inner"
        in:fade={{ duration: 180 }}
        out:fade={{ duration: 120 }}
      >
        {@render details()}
      </div>
    </div>
  {/if}
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
    border-color: var(--link-color);
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .expandable-summary {
    width: 100%;
  }

  .expandable-details {
    width: 100%;
    margin-top: 0.5rem;
  }

  .details-inner {
    overflow: visible;
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

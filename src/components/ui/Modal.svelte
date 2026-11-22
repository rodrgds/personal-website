<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  import { cue } from "../../lib/sound";

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
    title?: string;
    size?: "sm" | "md" | "lg" | "xl";
    headerLink?: string;
    headerLinkText?: string;
    children?: Snippet;
  }

  let {
    isOpen = $bindable(false),
    onClose,
    title,
    size = "md",
    headerLink,
    headerLinkText = "profile",
    children,
  }: Props = $props();

  let dialogElement: HTMLDialogElement;
  // Sound only on a real change, not on the first render.
  let shown = false;

  // Handle dialog open/close
  $effect(() => {
    if (isOpen && dialogElement) {
      dialogElement.showModal();
      document.body.style.overflow = "hidden";
      if (!shown) cue("open");
      shown = true;
    } else if (!isOpen && dialogElement) {
      dialogElement.close();
      document.body.style.overflow = "";
      if (shown) cue("close");
      shown = false;
    }
  });

  function handleClose() {
    isOpen = false;
    onClose?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogElement) {
      handleClose();
    }
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
    }
  }

  onMount(() => {
    return () => {
      document.body.style.overflow = "";
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogElement}
  class="modal modal-{size}"
  onclick={handleBackdropClick}
  onkeydown={handleEscape}
  data-no-vim
>
  <div class="modal-content">
    <div class="modal-header">
      <h2>{title ?? ""}</h2>
      <div class="modal-header-actions">
        {#if headerLink}
          <a
            href={headerLink}
            target="_blank"
            rel="noopener noreferrer"
            class="header-link"
            data-no-link-fx
          >
            {headerLinkText} ↗
          </a>
        {/if}
        <button
          class="close-button"
          type="button"
          onclick={handleClose}
          aria-label="Close"
          title="Close (Esc)">x</button
        >
      </div>
    </div>
    <div class="modal-body">
      {#if isOpen && children}
        {@render children()}
      {/if}
    </div>
  </div>
</dialog>

<style>
  /* A terminal window over the page: a command in the title bar, [x] to quit. */
  .modal {
    max-width: calc(100vw - 2rem);
    max-height: 85vh;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 0;
    background: var(--term-panel);
    color: var(--text-color);
    box-shadow: 0.5rem 0.5rem 0 rgb(0 0 0 / 0.28);
    font-family: var(--font-family);
  }

  .modal[open] {
    animation: modal-on 0.32s steps(8, end);
  }

  .modal::backdrop {
    background:
      repeating-linear-gradient(
        to bottom,
        rgb(0 0 0 / 0.12) 0 1px,
        transparent 1px 3px
      ),
      color-mix(in srgb, var(--background-color) 78%, transparent);
  }

  /* Power on like a CRT: a bright line that opens into the window. */
  @keyframes modal-on {
    0% {
      clip-path: inset(49% 0 49% 0);
      filter: brightness(2.2);
    }

    40% {
      clip-path: inset(30% 0 30% 0);
      filter: brightness(1.5);
    }

    100% {
      clip-path: inset(0);
      filter: none;
    }
  }

  .modal-sm {
    width: 26rem;
  }

  .modal-md {
    width: 38rem;
  }

  .modal-lg {
    width: 52rem;
  }

  .modal-xl {
    width: 64rem;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.4rem 0.35rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
  }

  .modal-header h2 {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--gray-color);
    font-family: inherit;
    font-size: 0.76rem;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modal-header h2::before {
    color: var(--tc-host);
    content: "■";
    font-size: 0.6rem;
  }

  .modal-header-actions {
    display: flex;
    flex: none;
    gap: 0.4rem;
    align-items: center;
  }

  .header-link,
  .close-button {
    padding: 0 0.35rem;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.76rem;
    line-height: 1.6;
    text-decoration: none;
    text-shadow: none;
    white-space: nowrap;
    cursor: pointer;
  }

  .header-link {
    color: var(--link-color);
  }

  .close-button {
    color: var(--text-color);
  }

  .header-link::before,
  .close-button::before {
    content: "[";
  }

  .header-link::after,
  .close-button::after {
    content: "]";
  }

  .header-link:hover,
  .header-link:focus-visible {
    background: var(--link-color);
    color: var(--background-color);
  }

  .close-button:hover,
  .close-button:focus-visible {
    background: var(--flexoki-red);
    color: var(--background-color);
  }

  .modal-body {
    flex: 1;
    padding: 1rem 1.1rem;
    overflow-y: auto;
    font-size: 0.84rem;
    scrollbar-color: var(--border-color) transparent;
    scrollbar-width: thin;
  }

  @media (max-width: 768px) {
    .modal {
      width: 100% !important;
      max-height: calc(
        90vh - env(safe-area-inset-top) - env(safe-area-inset-bottom)
      );
      margin-top: max(1.5rem, env(safe-area-inset-top));
      margin-bottom: env(safe-area-inset-bottom);
    }

    .modal-body {
      padding: 0.8rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal[open] {
      animation: none;
    }
  }
</style>

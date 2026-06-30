<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

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
    headerLinkText = "View profile",
    children,
  }: Props = $props();

  let dialogElement: HTMLDialogElement;

  // Handle dialog open/close
  $effect(() => {
    if (isOpen && dialogElement) {
      dialogElement.showModal();
      document.body.style.overflow = "hidden";
    } else if (!isOpen && dialogElement) {
      dialogElement.close();
      document.body.style.overflow = "";
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
>
  <div class="modal-content">
    {#if title}
      <div class="modal-header">
        <h2>{title}</h2>
        <div class="modal-header-actions">
          {#if headerLink}
            <a
              href={headerLink}
              target="_blank"
              rel="noopener noreferrer"
              class="header-link"
            >
              {headerLinkText} →
            </a>
          {/if}
          <button
            class="close-button"
            onclick={handleClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
      </div>
    {:else}
      <button
        class="close-button-absolute"
        onclick={handleClose}
        aria-label="Close modal"
      >
        ×
      </button>
    {/if}
    <div class="modal-body">
      {#if isOpen && children}
        {@render children()}
      {/if}
    </div>
  </div>
</dialog>

<style>
  .modal {
    border: none;
    border-radius: 0.45rem;
    padding: 0;
    max-width: 90vw;
    max-height: 85vh;
    background: var(--background-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    animation: modalFadeIn 0.2s ease-out;
  }

  .modal::backdrop {
    background: color-mix(in srgb, var(--background-color) 74%, transparent);
    animation: backdropFadeIn 0.2s ease-out;
  }

  @keyframes modalFadeIn {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes backdropFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-sm {
    width: 400px;
  }

  .modal-md {
    width: 600px;
  }

  .modal-lg {
    width: 800px;
  }

  .modal-xl {
    width: 1000px;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-color);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .modal-header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header-link {
    font-size: 0.875rem;
    color: var(--link-color);
    transition: opacity 0.2s;
    white-space: nowrap;
  }

  .header-link:hover {
    opacity: 0.7;
  }

  .close-button,
  .close-button-absolute {
    background: none;
    border: none;
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
    color: var(--text-color);
    padding: 0.25rem 0.5rem;
    transition:
      background-color 0.16s ease,
      color 0.16s ease;
    border-radius: 0.28rem;
  }

  .close-button:hover,
  .close-button-absolute:hover {
    background: var(--bg-secondary);
    color: var(--heading-color);
  }

  .close-button-absolute {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 10;
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  /* Scrollbar styling */
  .modal-body::-webkit-scrollbar {
    width: 8px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: var(--bg-secondary);
    border-radius: 4px;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 4px;
  }

  .modal-body::-webkit-scrollbar-thumb:hover {
    background: var(--gray-color);
  }

  @media (max-width: 768px) {
    .modal {
      max-width: 95vw;
      max-height: calc(
        90vh - env(safe-area-inset-top) - env(safe-area-inset-bottom)
      );
      width: 100% !important;
      margin-top: max(1.5rem, env(safe-area-inset-top));
      margin-bottom: env(safe-area-inset-bottom);
    }

    .modal-header {
      padding: 1rem;
    }

    .modal-header h2 {
      font-size: 1.25rem;
    }

    .modal-body {
      padding: 1rem;
    }
  }

</style>

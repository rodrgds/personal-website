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
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</dialog>

<style>
  .modal {
    border: none;
    border-radius: 1rem;
    padding: 0;
    max-width: 90vw;
    max-height: 85vh;
    background: var(--background-color);
    color: var(--text-color);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: modalFadeIn 0.2s ease-out;
  }

  .modal::backdrop {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
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
    border-bottom: 1px solid var(--border-color, #e5e5e5);
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
    text-decoration: none;
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
    transition: all 0.2s;
    border-radius: 0.5rem;
  }

  .close-button:hover,
  .close-button-absolute:hover {
    background: rgba(0, 0, 0, 0.05);
    transform: scale(1.1);
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
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: var(--link-color, #0066cc);
    border-radius: 4px;
  }

  .modal-body::-webkit-scrollbar-thumb:hover {
    background: var(--link-color-hover, #0052a3);
  }

  @media (max-width: 768px) {
    .modal {
      max-width: 95vw;
      max-height: 90vh;
      width: 100% !important;
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

  @media (prefers-color-scheme: dark) {
    .modal {
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    }

    .close-button:hover,
    .close-button-absolute:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }
</style>

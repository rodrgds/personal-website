<script lang="ts">
  export let variant:
    | "primary"
    | "secondary"
    | "outline"
    | "danger"
    | "success" = "primary";
  export let size: "sm" | "md" | "lg" = "md";
  export let type: "button" | "submit" | "reset" = "button";
  export let disabled = false;
  export let fullWidth = false;

  // Additional classes
  let clazz = "";
  export { clazz as class };
</script>

<button
  {type}
  {disabled}
  class="btn btn-{variant} btn-{size} {fullWidth ? 'w-full' : ''} {clazz}"
  on:click
>
  <slot />
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.28rem;
    font-weight: 500;
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease;
    cursor: pointer;
    border: 1px solid transparent;
    line-height: 1;
    font-family: inherit;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Sizes */
  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }

  .btn-md {
    padding: 0.625rem 1.25rem;
    font-size: 1rem;
  }

  .btn-lg {
    padding: 0.75rem 1.5rem;
    font-size: 1.125rem;
  }

  /* Variants */
  .btn-primary {
    background-color: var(--link-color);
    color: var(--background-color);
  }
  .btn-primary:hover:not(:disabled) {
    background-color: var(--accent);
  }

  .btn-secondary {
    background-color: var(--bg-secondary);
    border-color: var(--border-color);
    color: var(--text-color);
  }

  .btn-danger {
    background-color: var(--error);
    color: var(--background-color);
  }
  .btn-danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-success {
    background-color: var(--flexoki-green);
    color: var(--background-color);
  }
  .btn-success:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-outline {
    background-color: transparent;
    border-color: var(--border-color);
    color: var(--text-color);
  }
  .btn-outline:hover:not(:disabled) {
    background-color: var(--bg-secondary);
  }
</style>

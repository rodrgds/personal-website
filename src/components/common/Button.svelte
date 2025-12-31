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
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.2s ease-in-out;
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
    color: white;
  }
  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-secondary {
    background-color: var(--gray-color);
    color: white;
  }

  .btn-danger {
    background-color: #ef4444;
    color: white;
  }
  .btn-danger:hover:not(:disabled) {
    background-color: #dc2626;
  }

  .btn-success {
    background-color: #10b981;
    color: white;
  }
  .btn-success:hover:not(:disabled) {
    background-color: #059669;
  }

  .btn-outline {
    background-color: transparent;
    border-color: var(--border-color);
    color: var(--text-color);
  }
  .btn-outline:hover:not(:disabled) {
    background-color: var(--border-color);
  }
</style>

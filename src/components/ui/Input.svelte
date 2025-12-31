<script lang="ts">
  export let value: any;
  export let type = "text";
  export let placeholder = "";
  export let id = "";
  export let min: number | string | undefined = undefined;
  export let step: number | string | undefined = undefined;

  // Allow extra props
  let clazz = "";
  export { clazz as class };
</script>

<input
  {type}
  {id}
  {placeholder}
  {min}
  {step}
  class="input-base {clazz}"
  bind:value
  on:input
  {...$$restProps}
/>

<style>
  .input-base {
    display: block;
    width: 100%;
    padding: 0.625rem 0.875rem;
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--text-color);
    background-color: var(--background-color);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    transition: all 0.2s ease-in-out;
    font-family: inherit;
  }

  .input-base:focus {
    border-color: var(--link-color);
    outline: none;
    box-shadow: 0 0 0 3px rgba(58, 110, 170, 0.1);
  }

  :global(.dark) .input-base {
    background-color: rgba(30, 30, 30, 0.5);
  }

  /* :global(.dark) .input-base:focus {
     box-shadow: 0 0 0 3px rgba(255, 136, 0, 0.1);
  } */

  .input-base::placeholder {
    color: var(--gray-color);
    opacity: 0.7;
  }
</style>

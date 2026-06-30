<script lang="ts">
  import Label from "./Label.svelte";

  export let id: string;
  export let label: string | undefined = undefined;
  export let value: string | number;
  export let options: { value: string | number; label: string }[] = [];
  export let disabled = false;
</script>

<div class="select-container">
  {#if label}
    <Label forId={id}>{label}</Label>
  {/if}
  <select {id} bind:value {disabled} class="select-input">
    {#each options as option}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</div>

<style>
  .select-container {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
  }

  .select-input {
    width: 100%;
    padding: 0.5rem;
    border-radius: 0.28rem;
    border: 1px solid var(--border-color);
    background-color: var(--bg-secondary);
    color: var(--text-color);
    font-size: 0.875rem;
    line-height: 1.25rem;
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease;
  }

  .select-input:focus {
    outline: none;
    border-color: var(--link-color);
    background-color: var(--background-color);
  }

  .select-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--surface-hover);
  }
</style>

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
    border-radius: 6px;
    border: 1px solid var(--border-color, #e5e7eb);
    background-color: var(--input-bg, #ffffff);
    color: var(--text-color, #374151);
    font-size: 0.875rem;
    line-height: 1.25rem;
    transition: all 0.2s;
  }

  .select-input:focus {
    outline: none;
    border-color: var(--primary-color, #3b82f6);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .select-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--disabled-bg, #f3f4f6);
  }

  @media (prefers-color-scheme: dark) {
    .select-input {
      background-color: #2a2a2a;
      border-color: #444;
      color: #eee;
    }

    .select-input:disabled {
      background-color: #333;
    }
  }
</style>

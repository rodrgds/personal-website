<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Label from "./Label.svelte";
  import Input from "./Input.svelte";

  export let id: string;
  export let label: string | undefined = undefined;
  export let value: string | number;
  export let options: { value: string | number; label: string }[] = [];
  export let placeholder = "Select...";
  export let disabled = false;

  const dispatch = createEventDispatcher();

  let isOpen = false;
  let searchQuery = "";
  let container: HTMLDivElement;

  $: selectedOption = options.find((o) => o.value === value);
  $: filteredOptions = options
    .filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 100); // Limit results for performance

  function toggle() {
    if (disabled) return;
    isOpen = !isOpen;
    if (isOpen) {
      searchQuery = "";
      // Focus input on open
      setTimeout(() => {
        const input = container?.querySelector("input");
        input?.focus();
      }, 50);
    }
  }

  function select(option: { value: string | number; label: string }) {
    value = option.value;
    isOpen = false;
    dispatch("change", { value });
  }

  function handleOutsideClick(event: MouseEvent) {
    if (isOpen && container && !container.contains(event.target as Node)) {
      isOpen = false;
    }
  }
</script>

<svelte:window on:click={handleOutsideClick} />

<div class="searchable-select-container" bind:this={container}>
  {#if label}
    <Label forId={id}>{label}</Label>
  {/if}

  <div
    class="trigger {isOpen ? 'open' : ''} {disabled ? 'disabled' : ''}"
    on:click={toggle}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === "Enter" && toggle()}
  >
    <span class="selected-label">
      {selectedOption ? selectedOption.label : placeholder}
    </span>
    <span class="chevron">▼</span>
  </div>

  {#if isOpen}
    <div class="dropdown">
      <div class="search-box">
        <input
          type="text"
          placeholder="Search..."
          bind:value={searchQuery}
          on:click|stopPropagation
        />
      </div>
      <div class="options-list">
        {#each filteredOptions as option}
          <div
            class="option {option.value === value ? 'selected' : ''}"
            on:click={() => select(option)}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === "Enter" && select(option)}
          >
            {option.label}
          </div>
        {/each}
        {#if filteredOptions.length === 0}
          <div class="no-results">No results found</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .searchable-select-container {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .trigger {
    width: 100%;
    padding: 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--border-color, #e5e7eb);
    background-color: var(--input-bg, #ffffff);
    color: var(--text-color, #374151);
    font-size: 0.875rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
  }

  .trigger.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--disabled-bg, #f3f4f6);
  }

  .chevron {
    font-size: 0.7rem;
    opacity: 0.5;
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--input-bg, #ffffff);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 50;
    overflow: hidden;
  }

  .search-box {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
  }

  .search-box input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 4px;
    font-size: 0.875rem;
    background: transparent;
    color: var(--text-color);
  }

  .search-box input:focus {
    outline: none;
    border-color: var(--primary-color, #3b82f6);
  }

  .options-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .option {
    padding: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--text-color);
  }

  .option:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .option.selected {
    background-color: rgba(59, 130, 246, 0.1);
    color: var(--primary-color, #3b82f6);
    font-weight: 500;
  }

  .no-results {
    padding: 0.75rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.875rem;
  }

  @media (prefers-color-scheme: dark) {
    .trigger,
    .dropdown,
    .search-box input {
      background-color: #2a2a2a;
      border-color: #444;
      color: #eee;
    }

    .trigger.disabled {
      background-color: #333;
    }

    .option:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
  }
</style>

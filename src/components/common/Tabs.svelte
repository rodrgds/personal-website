<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let items: { label: string; value: string }[] = [];
  export let activeTab: string = "";

  const dispatch = createEventDispatcher();

  function selectTab(value: string) {
    activeTab = value;
    dispatch("change", value);
  }
</script>

<div class="tabs-container">
  <div class="tabs-header">
    {#each items as item}
      <button
        class="tab-btn {activeTab === item.value ? 'active' : ''}"
        on:click={() => selectTab(item.value)}
      >
        {item.label}
      </button>
    {/each}
  </div>
  <div class="tab-content">
    <slot />
  </div>
</div>

<style>
  .tabs-container {
    width: 100%;
  }

  .tabs-header {
    display: flex;
    border-bottom: 2px solid var(--border-color);
    margin-bottom: 1rem;
    padding-bottom: 1px;
    gap: 1rem;
    overflow-x: auto;
  }

  .tab-btn {
    background: transparent;
    border: none;
    padding: 0.5rem 0.25rem;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-color);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    margin-bottom: -2px;
    position: relative;
    white-space: nowrap;
    opacity: 0.7;
  }

  .tab-btn:hover {
    color: var(--link-color);
    opacity: 1;
  }

  .tab-btn.active {
    color: var(--link-color);
    border-bottom-color: var(--link-color);
    opacity: 1;
    font-weight: 600;
  }
</style>

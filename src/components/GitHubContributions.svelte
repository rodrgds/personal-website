<script lang="ts">
  import { onMount } from 'svelte';
  
  interface ContributionDay {
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
  }
  
  interface ContributionWeek {
    days: ContributionDay[];
  }
  
  let contributions: ContributionWeek[] = [];
  let totalContributions = 0;
  let startYear = new Date().getFullYear();
  let loading = true;
  let error: string | null = null;
  let fromCache = false;
  
  const username = 'rodrgds';
  
  // Orange/Yellow color scale (warm theme)
  const colorScale = [
    'var(--contrib-level-0, #fff5e6)', // level 0
    'var(--contrib-level-1, #ffd699)', // level 1
    'var(--contrib-level-2, #ffaa33)', // level 2
    'var(--contrib-level-3, #ff8800)', // level 3
    'var(--contrib-level-4, #cc5500)'  // level 4
  ];
  
  async function fetchContributions() {
    try {
      loading = true;
      error = null;
      
      const response = await fetch(`/api/github-contributions?username=${username}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch contributions');
      }
      
      const data = await response.json();
      
      // Reverse so latest is on the left
      contributions = data.contributions.reverse();
      totalContributions = data.totalContributions;
      startYear = data.startYear;
      fromCache = data.fromCache;
      
    } catch (e) {
      console.error('Error fetching contributions:', e);
      error = e instanceof Error ? e.message : 'Failed to load contributions';
    } finally {
      loading = false;
    }
  }
  
  onMount(() => {
    fetchContributions();
  });
  
  // Refresh data every hour
  setInterval(() => {
    fetchContributions();
  }, 1000 * 60 * 60);
</script>

<div class="github-contributions">
  <h3 class="contributions-title">
    <a href="https://github.com/{username}" target="_blank" rel="noopener noreferrer">
      {totalContributions.toLocaleString()} contributions since {startYear}
      {#if fromCache}
        <span class="cache-badge" title="Data is cached">cached</span>
      {/if}
    </a>
  </h3>
  
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      Loading contributions...
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button on:click={fetchContributions} class="retry-btn">Retry</button>
    </div>
  {:else}
    <div class="scroll-hint">
      <span>← Recent</span>
      <span class="scroll-arrow">Scroll → for older</span>
    </div>
    
    <div class="contributions-scroll-container">
      <div class="contributions-wrapper">
        <div class="contributions-grid">
          {#each contributions as week, weekIndex}
            <div class="week" title="Week of {week.days[0]?.date || 'unknown'}">
              {#each week.days as day}
                <div 
                  class="day" 
                  style="background-color: {colorScale[day.level]}"
                  title="{day.count} contributions on {day.date}"
                ></div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
    
    <div class="legend">
      <span class="legend-label">Less</span>
      {#each colorScale as color, i}
        <div class="legend-day" style="background-color: {color}"></div>
      {/each}
      <span class="legend-label">More</span>
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --contrib-level-0: #fff5e6;
    --contrib-level-1: #ffd699;
    --contrib-level-2: #ffaa33;
    --contrib-level-3: #ff8800;
    --contrib-level-4: #cc5500;
    --contrib-bg: #f6f8fa;
    --contrib-border: #d0d7de;
    --contrib-text: #57606a;
    --contrib-text-primary: #24292f;
    --contrib-hover-outline: rgba(0, 0, 0, 0.2);
  }
  
  :global([data-theme="dark"]) {
    --contrib-level-0: #3d2817;
    --contrib-level-1: #8b5a2b;
    --contrib-level-2: #cd7f32;
    --contrib-level-3: #e6a817;
    --contrib-level-4: #ffcc00;
    --contrib-bg: #161b22;
    --contrib-border: #30363d;
    --contrib-text: #8b949e;
    --contrib-text-primary: #c9d1d9;
    --contrib-hover-outline: rgba(255, 255, 255, 0.3);
  }
  
  .github-contributions {
    margin: 2rem 0;
    padding: 1.5rem;
    background: var(--contrib-bg);
    border-radius: 12px;
    border: 1px solid var(--contrib-border);
  }
  
  .contributions-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--contrib-text);
  }
  
  .contributions-title a {
    color: inherit;
    text-decoration: none;
    transition: color 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .contributions-title a:hover {
    color: var(--contrib-text-primary);
    text-decoration: underline;
  }
  
  .cache-badge {
    font-size: 0.65rem;
    padding: 0.1rem 0.4rem;
    background: var(--contrib-level-1);
    color: var(--contrib-text-primary);
    border-radius: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .scroll-hint {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: var(--contrib-text);
    margin-bottom: 0.5rem;
    padding: 0 0.25rem;
  }
  
  .scroll-arrow {
    opacity: 0.7;
  }
  
  .contributions-scroll-container {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5rem 0;
    margin: 0 -0.5rem;
    scrollbar-width: thin;
    scrollbar-color: var(--contrib-border) transparent;
  }
  
  .contributions-scroll-container::-webkit-scrollbar {
    height: 8px;
  }
  
  .contributions-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .contributions-scroll-container::-webkit-scrollbar-thumb {
    background-color: var(--contrib-border);
    border-radius: 4px;
  }
  
  .contributions-wrapper {
    display: inline-block;
    min-width: 100%;
  }
  
  .contributions-grid {
    display: flex;
    gap: 3px;
    flex-direction: row;
  }
  
  .week {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
  }
  
  .day {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    transition: transform 0.1s, outline 0.1s;
    cursor: pointer;
  }
  
  .day:hover {
    transform: scale(1.3);
    outline: 2px solid var(--contrib-hover-outline);
    z-index: 10;
    position: relative;
  }
  
  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 0.75rem;
    font-size: 0.75rem;
    color: var(--contrib-text);
  }
  
  .legend-day {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  
  .legend-label {
    margin: 0 4px;
  }
  
  .loading, .error {
    text-align: center;
    padding: 2rem;
    color: var(--contrib-text);
    font-size: 0.875rem;
  }
  
  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--contrib-border);
    border-top-color: var(--contrib-level-3);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error {
    color: #cf222e;
  }
  
  .retry-btn {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--contrib-level-2);
    color: var(--contrib-text-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.2s;
  }
  
  .retry-btn:hover {
    background: var(--contrib-level-3);
  }
  
  @media (max-width: 768px) {
    .github-contributions {
      padding: 1rem;
      margin: 1rem 0;
    }
    
    .contributions-grid {
      gap: 2px;
    }
    
    .day {
      width: 8px;
      height: 8px;
    }
    
    .week {
      gap: 2px;
    }
  }
</style>
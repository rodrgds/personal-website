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
  let loading = true;
  let error: string | null = null;
  let startYear = 2020;
  let endYear = new Date().getFullYear();
  
  const username = 'rodrgds';
  
  // Orange/Yellow color scale (warm theme)
  // Uses CSS custom properties for light/dark mode support
  const colorScale = [
    'var(--contrib-level-0, #fff5e6)', // level 0 - lightest
    'var(--contrib-level-1, #ffd699)', // level 1
    'var(--contrib-level-2, #ffaa33)', // level 2
    'var(--contrib-level-3, #ff8800)', // level 3
    'var(--contrib-level-4, #cc5500)'  // level 4 - darkest
  ];
  
  function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    if (count <= 3) return 1;
    if (count <= 6) return 2;
    if (count <= 9) return 3;
    return 4;
  }
  
  async function fetchContributions() {
    try {
      // In production, fetch from GitHub GraphQL API
      // For now, generate realistic mock data spanning multiple years
      generateMockData();
    } catch (e) {
      error = 'Failed to load contributions';
      loading = false;
    }
  }
  
  function generateMockData() {
    const weeks: ContributionWeek[] = [];
    totalContributions = 0;
    
    const today = new Date();
    // Start from ~5 years ago (adjust based on when you joined GitHub)
    const startDate = new Date(startYear, 0, 1);
    
    // Calculate weeks from start date to today
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const totalWeeks = Math.ceil((today.getTime() - startDate.getTime()) / msPerWeek) + 1;
    
    for (let week = 0; week < totalWeeks; week++) {
      const weekDays: ContributionDay[] = [];
      
      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + week * 7 + day);
        
        if (currentDate > today) break;
        
        // Generate realistic activity patterns
        // More activity in recent years, less in early years
        const yearProgress = (currentDate.getFullYear() - startYear) / (endYear - startYear);
        const isWeekend = day === 0 || day === 6;
        
        // Base probability increases over time (you got more active)
        let baseProbability = 0.2 + (yearProgress * 0.5);
        if (isWeekend) baseProbability *= 0.4;
        
        // Add some randomness and streaks
        let count = 0;
        if (Math.random() < baseProbability) {
          count = Math.floor(Math.random() * 15) + 1;
        }
        
        totalContributions += count;
        
        weekDays.push({
          date: currentDate.toISOString().split('T')[0],
          count,
          level: getLevel(count)
        });
      }
      
      if (weekDays.length > 0) {
        weeks.push({ days: weekDays });
      }
    }
    
    // REVERSE: Latest first (left), earliest last (right)
    contributions = weeks.reverse();
    loading = false;
  }
  
  onMount(() => {
    fetchContributions();
  });
</script>

<div class="github-contributions">
  <h3 class="contributions-title">
    <a href="https://github.com/{username}" target="_blank" rel="noopener noreferrer">
      {totalContributions.toLocaleString()} contributions since {startYear}
    </a>
  </h3>
  
  {#if loading}
    <div class="loading">Loading contributions...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="scroll-hint">
      <span>← Recent</span>
      <span class="scroll-arrow">Scroll → for older</span>
    </div>
    
    <div class="contributions-scroll-container">
      <div class="contributions-wrapper">
        <!-- Contribution grid - latest on left -->
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
    
    <!-- Legend -->
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
  /* Light mode colors */
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
  
  /* Dark mode colors */
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
  }
  
  .contributions-title a:hover {
    color: var(--contrib-text-primary);
    text-decoration: underline;
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
    /* Latest (reversed array) is now on the left */
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
  
  .error {
    color: #cf222e;
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
    
    .scroll-hint {
      font-size: 0.7rem;
    }
  }
  
  /* Animation for loading */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .contributions-grid {
    animation: fadeIn 0.3s ease-in;
  }
</style>
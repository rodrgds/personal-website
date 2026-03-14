<script lang="ts">
  interface ContributionDay {
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
  }
  
  interface ContributionWeek {
    days: ContributionDay[];
  }
  
  let contributions = $state<ContributionWeek[]>([]);
  let totalContributions = $state(0);
  let startYear = $state(new Date().getFullYear());
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  const username = 'rodrgds';
  
  const colorScale = [
    'var(--contrib-level-0)',
    'var(--contrib-level-1)',
    'var(--contrib-level-2)',
    'var(--contrib-level-3)',
    'var(--contrib-level-4)'
  ];
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  function getMonthLabels(weeks: ContributionWeek[]): { month: string; index: number; year?: number }[] {
    const labels: { month: string; index: number; year?: number }[] = [];
    let lastMonth = -1;
    let lastYear = -1;
    
    weeks.forEach((week, index) => {
      const firstDay = week.days[0];
      if (firstDay) {
        const date = new Date(firstDay.date);
        const month = date.getMonth();
        const year = date.getFullYear();
        
        if (month !== lastMonth) {
          labels.push({ 
            month: monthNames[month], 
            index,
            year: lastYear !== -1 && year !== lastYear ? year : undefined 
          });
          lastMonth = month;
          if (lastYear === -1 || year !== lastYear) {
            lastYear = year;
          }
        }
      }
    });
    
    return labels;
  }
  
  function filterFutureDays(weeks: ContributionWeek[]): ContributionWeek[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return weeks.map(week => ({
      days: week.days.filter(day => {
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0);
        return dayDate <= today;
      })
    })).filter(week => week.days.length > 0);
  }
  
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
      
      const filtered = filterFutureDays(data.contributions);
      contributions = filtered.reverse();
      totalContributions = data.totalContributions;
      startYear = data.startYear;
      
    } catch (e) {
      console.error('Error fetching contributions:', e);
      error = e instanceof Error ? e.message : 'Failed to load contributions';
    } finally {
      loading = false;
    }
  }
  
  $effect(() => {
    fetchContributions();
    const interval = setInterval(fetchContributions, 1000 * 60 * 60);
    return () => clearInterval(interval);
  });
  
  const monthLabels = $derived(getMonthLabels(contributions));
</script>

<div class="github-contributions">
  <div class="contributions-header">
    <span class="contributions-count">
      {totalContributions.toLocaleString()} contributions since {startYear}
    </span>
    <div class="header-right">
      <div class="legend">
        <span class="legend-label">Less</span>
        {#each colorScale as color}
          <div class="legend-day" style="background-color: {color}"></div>
        {/each}
        <span class="legend-label">More</span>
      </div>
      <a href="https://github.com/{username}" target="_blank" rel="noopener noreferrer" class="github-link">
        View on GitHub →
      </a>
    </div>
  </div>
  
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      Loading...
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={fetchContributions} class="retry-btn">Retry</button>
    </div>
  {:else}
    <div class="contributions-scroll-container">
      <div class="contributions-wrapper">
        <div class="day-labels">
          <span></span>
          <span>Mon</span>
          <span></span>
          <span>Wed</span>
          <span></span>
          <span>Fri</span>
          <span></span>
        </div>
        <div class="contributions-grid">
          {#each contributions as week}
            <div class="week">
              {#each week.days as day}
                <div 
                  class="day" 
                  class:day-empty="{day.level === 0}"
                  style="background-color: {colorScale[day.level]}"
                  title="{day.count} contributions on {day.date}"
                ></div>
              {/each}
            </div>
          {/each}
        </div>
        <div class="month-labels">
          {#each monthLabels as label}
            <span 
              class="month-label" 
              style="left: calc(var(--contrib-cell-size) * {label.index})"
            >
              {label.month}
              {#if label.year}
                <span class="year-label">{label.year}</span>
              {/if}
            </span>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --contrib-level-0: #ebedf0;
    --contrib-level-1: #b3d4f5;
    --contrib-level-2: #6ba3d6;
    --contrib-level-3: #3a6eaa;
    --contrib-level-4: #1a4a7a;
    --contrib-cell-size: 13px;
  }
  
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --contrib-level-0: #2d1f00;
      --contrib-level-1: #5c3d00;
      --contrib-level-2: #8b5a00;
      --contrib-level-3: #b37500;
      --contrib-level-4: #ff9500;
    }
  }
  
  .github-contributions {
    margin: 1.5rem 0;
  }
  
  .contributions-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .contributions-count {
    font-size: 0.875rem;
    color: var(--text-color);
  }
  
  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .legend {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.65rem;
    color: var(--gray-color);
  }
  
  .legend-day {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  
  .legend-label {
    margin: 0 0.25rem;
  }
  
  .github-link {
    font-size: 0.75rem;
    color: var(--link-color);
    text-decoration: none;
  }
  
  .contributions-scroll-container {
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 1.5rem;
    margin: 0 -0.5rem;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color) transparent;
  }
  
  .contributions-scroll-container::-webkit-scrollbar {
    height: 6px;
  }
  
  .contributions-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .contributions-scroll-container::-webkit-scrollbar-thumb {
    background-color: var(--border-color);
    border-radius: 3px;
  }
  
  .contributions-wrapper {
    display: flex;
    flex-direction: column;
  }
  
  .day-labels {
    display: flex;
    flex-direction: column;
    gap: 3px;
    position: absolute;
    left: -2.5rem;
    font-size: 0.65rem;
    color: var(--gray-color);
    padding-top: 2px;
  }
  
  .day-labels span {
    height: 10px;
    line-height: 10px;
  }
  
  .contributions-grid {
    display: flex;
    gap: 3px;
    flex-direction: row;
    width: fit-content;
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
    transform: scale(1.2);
    outline: 2px solid var(--link-color);
    outline-offset: 1px;
    z-index: 10;
    position: relative;
  }
  
  .day-empty {
    background-color: var(--contrib-level-0);
  }
  
  .month-labels {
    position: relative;
    height: 1rem;
    margin-top: 0.25rem;
    width: fit-content;
    font-size: 0.65rem;
    color: var(--gray-color);
  }
  
  .month-label {
    position: absolute;
    white-space: nowrap;
  }
  
  .year-label {
    font-weight: 500;
    margin-left: 0.25rem;
  }
  
  .loading, .error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
    color: var(--gray-color);
    font-size: 0.875rem;
  }
  
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-color);
    border-top-color: var(--link-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error {
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .error p {
    margin: 0;
  }
  
  .retry-btn {
    padding: 0.4rem 0.8rem;
    background: var(--link-color);
    color: var(--background-color);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    font-family: inherit;
    transition: opacity 0.2s;
  }
  
  .retry-btn:hover {
    opacity: 0.8;
  }
  
  @media (max-width: 768px) {
    .github-contributions {
      --contrib-cell-size: 11px;
    }
    
    .legend {
      display: none;
    }
    
    .header-right {
      gap: 0.5rem;
    }
    
    .day-labels {
      display: none;
    }
    
    .contributions-scroll-container {
      margin-left: -1rem;
      margin-right: -1rem;
      padding-left: 1rem;
      padding-right: 1rem;
    }
    
    .day {
      width: 9px;
      height: 9px;
    }
    
    .week {
      gap: 2px;
    }
    
    .contributions-grid {
      gap: 2px;
    }
    
    .legend-day {
      width: 9px;
      height: 9px;
    }
  }
</style>
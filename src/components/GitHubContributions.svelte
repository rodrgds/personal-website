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
  
  const username = 'rodrgds';
  
  // GitHub-like color scale
  const colorScale = [
    '#ebedf0', // level 0
    '#9be9a8', // level 1
    '#40c463', // level 2
    '#30a14e', // level 3
    '#216e39'  // level 4
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
      // Try to fetch from GitHub's GraphQL API
      // Note: This requires a token for private data, but public contributions might work
      const query = `
        query {
          user(login: "${username}") {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    date
                    contributionCount
                  }
                }
              }
            }
          }
        }
      `;
      
      // For now, generate mock data that looks realistic
      // In production, you'd use a GitHub token and the GraphQL API
      generateMockData();
      
    } catch (e) {
      error = 'Failed to load contributions';
      loading = false;
    }
  }
  
  function generateMockData() {
    // Generate 52 weeks of data
    const weeks: ContributionWeek[] = [];
    totalContributions = 0;
    
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    
    // Start from the beginning of the week containing one year ago
    const startDate = new Date(oneYearAgo);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    for (let week = 0; week < 53; week++) {
      const weekDays: ContributionDay[] = [];
      
      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + week * 7 + day);
        
        if (currentDate > today) break;
        
        // Generate somewhat realistic random data
        // More activity on weekdays, less on weekends
        const isWeekend = day === 0 || day === 6;
        const baseProbability = isWeekend ? 0.3 : 0.7;
        
        let count = 0;
        if (Math.random() < baseProbability) {
          count = Math.floor(Math.random() * 12);
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
    
    contributions = weeks;
    loading = false;
  }
  
  onMount(() => {
    fetchContributions();
  });
  
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
</script>

<div class="github-contributions">
  <h3 class="contributions-title">
    <a href="https://github.com/{username}" target="_blank" rel="noopener noreferrer">
      {totalContributions} contributions in {new Date().getFullYear()}
    </a>
  </h3>
  
  {#if loading}
    <div class="loading">Loading contributions...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="contributions-container">
      <!-- Month labels -->
      <div class="month-labels">
        {#each monthLabels as month}
          <span class="month-label">{month}</span>
        {/each}
      </div>
      
      <!-- Contribution grid -->
      <div class="contributions-grid">
        {#each contributions as week}
          <div class="week">
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
      
      <!-- Legend -->
      <div class="legend">
        <span class="legend-label">Less</span>
        {#each colorScale as color, i}
          <div class="legend-day" style="background-color: {color}"></div>
        {/each}
        <span class="legend-label">More</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .github-contributions {
    margin: 2rem 0;
    padding: 1.5rem;
    background: var(--bg-secondary, #f6f8fa);
    border-radius: 12px;
    border: 1px solid var(--border-color, #d0d7de);
  }
  
  .contributions-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary, #57606a);
  }
  
  .contributions-title a {
    color: inherit;
    text-decoration: none;
    transition: color 0.2s;
  }
  
  .contributions-title a:hover {
    color: var(--text-primary, #24292f);
    text-decoration: underline;
  }
  
  .contributions-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .month-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--text-secondary, #57606a);
    padding: 0 0.25rem;
  }
  
  .month-label {
    flex: 1;
    text-align: center;
  }
  
  .contributions-grid {
    display: flex;
    gap: 3px;
    overflow-x: auto;
    padding: 0.25rem;
  }
  
  .week {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  
  .day {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    transition: transform 0.1s;
  }
  
  .day:hover {
    transform: scale(1.2);
    outline: 1px solid rgba(0, 0, 0, 0.2);
  }
  
  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary, #57606a);
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
    color: var(--text-secondary, #57606a);
    font-size: 0.875rem;
  }
  
  .error {
    color: #cf222e;
  }
  
  @media (max-width: 768px) {
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
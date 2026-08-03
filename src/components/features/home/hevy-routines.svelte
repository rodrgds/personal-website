<script lang="ts">
  import { actions } from "astro:actions";

  interface Set {
    index: number;
    type: string;
    weight_kg?: number;
    reps?: number;
    distance_meters?: number;
    duration_seconds?: number;
    rpe?: number;
  }

  interface Exercise {
    exercise_template_id: string;
    title: string;
    notes?: string;
    sets: Set[];
    rest_seconds?: string;
  }

  interface Routine {
    id: string;
    title: string;
    folder_id?: number;
    exercises: Exercise[];
  }

  interface WorkoutStats {
    workoutCount: number;
  }

  let routines: Routine[] = $state([]);
  let stats: WorkoutStats | null = $state(null);
  let loading = $state(true);
  let error: string | null = $state(null);

  let rootEl: HTMLDivElement | null = $state(null);
  let openDetailsId: string | null = $state(null);

  // Helper function to format sets - FIX for weighted exercises
  function formatSet(set: Set): string {
    // Check if it's a weighted exercise (has weight but also reps)
    if (set.weight_kg !== undefined && set.weight_kg > 0 && set.reps) {
      return `${set.weight_kg}kg × ${set.reps}`;
    }
    // Bodyweight exercises (reps only)
    if (set.reps && !set.weight_kg) {
      return `${set.reps} reps`;
    }
    // Duration-based exercises
    if (set.duration_seconds) {
      const mins = Math.floor(set.duration_seconds / 60);
      const secs = set.duration_seconds % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    // Distance-based exercises
    if (set.distance_meters) {
      return `${set.distance_meters}m`;
    }
    return "—";
  }

  async function loadRoutines() {
    loading = true;
    error = null;

    try {
      const result = await actions.getHevyData({ forceRefresh: false });

      if (result.error) {
        error = result.error.message || "Failed to load Hevy data";
        return;
      }

      if (result.data) {
        // Reverse the order of routines
        routines = (result.data.routines || []).reverse();
        stats = result.data.stats;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "An unexpected error occurred";
    } finally {
      loading = false;
    }
  }

  // Load routines when component mounts
  $effect(() => {
    loadRoutines();
  });

  function closeAllDetailsExcept(id: string) {
    if (!rootEl) return;

    const openDetails =
      rootEl.querySelectorAll<HTMLDetailsElement>("details[open]");

    for (const d of openDetails) {
      const did = d.getAttribute("data-dd-id");
      if (did && did !== id) {
        d.removeAttribute("open");
      }
    }
  }

  function handleDetailsToggle(id: string, e: Event) {
    const details = e.currentTarget as HTMLDetailsElement;
    if (!details) return;

    if (details.open) {
      openDetailsId = id;
      closeAllDetailsExcept(id);
      return;
    }

    if (openDetailsId === id) {
      openDetailsId = null;
    }
  }

  // Masonry column helpers — greedy shortest-column algorithm.
  // Each item is placed in whichever column currently has the least estimated
  // height, which keeps columns visually balanced regardless of how many
  // exercises each routine contains.
  function greedyColumns<T>(
    items: T[],
    numCols: number,
    estimateHeight: (item: T) => number,
  ): T[][] {
    const cols: T[][] = Array.from({ length: numCols }, () => []);
    const heights = new Array<number>(numCols).fill(0);

    for (const item of items) {
      const shortestCol = heights.indexOf(Math.min(...heights));
      cols[shortestCol].push(item);
      heights[shortestCol] += estimateHeight(item);
    }

    return cols;
  }

  // Height estimates (in arbitrary units — only relative values matter).
  // A card has a base height plus a contribution per exercise row.
  function estimateRoutineHeight(routine: Routine): number {
    const exerciseCount = routine.exercises?.length ?? 0;
    return 60 + exerciseCount * 36;
  }

  let columnCount = $state(2);

  $effect(() => {
    function update() {
      columnCount = window.innerWidth >= 600 ? 2 : 1;
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  });

  let routineColumns = $derived(
    greedyColumns(routines, columnCount, estimateRoutineHeight),
  );
</script>

<div class="hevy-routines" bind:this={rootEl}>
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading your routines...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>❌ {error}</p>
      <button onclick={loadRoutines} class="retry-button">Retry</button>
    </div>
  {:else}
    <!-- Data Source Indicator -->
    <div class="data-source">
      <img src="/logos/hevy.png" alt="Hevy" class="source-logo" />
      <span class="source-text"
        >Data automatically tracked from my Hevy account</span
      >
    </div>

    {#if stats}
      <div class="stats-header">
        <div class="stat-card">
          <div class="stat-label">Total Workouts</div>
          <div class="stat-value">{stats.workoutCount}</div>
        </div>
      </div>
    {/if}

    {#if routines.length === 0}
      <div class="empty">
        <p>No routines found in your "Current" folder.</p>
        <p class="hint">Add some routines to the "Current" folder in Hevy!</p>
      </div>
    {:else}
      <div class="routines-masonry">
        {#each routineColumns as column, columnIndex (columnIndex)}
          <div class="masonry-column">
            {#each column as routine (routine.id)}
              <div class="routine-card">
                <h3>{routine.title}</h3>
                {#if routine.exercises && routine.exercises.length > 0}
                  <div class="exercises">
                    {#each routine.exercises as exercise, exIdx (
                      `${routine.id}-${exercise.exercise_template_id}-${exIdx}`
                    )}
                      {@const setCount = exercise.sets?.length || 0}
                      {@const ddId = `exercise-${routine.id}-${exercise.exercise_template_id}-${exIdx}`}
                      <details
                        class="exercise-item"
                        data-dd-id={ddId}
                        ontoggle={(e) => handleDetailsToggle(ddId, e)}
                      >
                        <summary class="exercise-header">
                          <span class="exercise-title">{exercise.title}</span>
                          {#if setCount > 0}
                            <span class="set-count"
                              >{setCount} set{setCount === 1 ? "" : "s"}</span
                            >
                          {/if}
                        </summary>
                        {#if (exercise.notes && exercise.notes.trim().length > 0) || setCount > 0}
                          <div class="exercise-dropdown dropdown-content">
                            {#if exercise.notes && exercise.notes.trim().length > 0}
                              <div class="exercise-notes">{exercise.notes}</div>
                            {/if}
                            {#if exercise.sets && exercise.sets.length > 0}
                              <div class="sets-grid" role="group" aria-label="Sets">
                                {#each exercise.sets as set, idx (
                                  `${exercise.exercise_template_id}-${idx}`
                                )}
                                  <div class="set-item">
                                    <span class="set-number">{idx + 1}</span>
                                    <span class="set-details">{formatSet(set)}</span
                                    >
                                    {#if set.rpe}
                                      <span class="set-rpe">RPE {set.rpe}</span>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </details>
                    {/each}
                  </div>
                {:else}
                  <p class="no-exercises">No exercises in this routine</p>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .hevy-routines {
    width: 100%;
  }

  .data-source {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.5rem;
    border: 1px solid var(--border-color, #e5e5e5);
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .source-logo {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .source-text {
    flex: 1;
  }

  .loading,
  .error,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-left-color: var(--link-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error {
    color: #ef4444;
  }

  .retry-button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--link-color);
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
    transition: opacity 0.2s;
  }

  .retry-button:hover {
    opacity: 0.9;
  }

  .empty {
    gap: 0.5rem;
  }

  .hint {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .stats-header {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .stat-card {
    flex: 0 0 auto;
    min-width: 150px;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid var(--border-color, #e5e5e5);
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .stat-label {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-bottom: 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    color: var(--link-color);
  }

  .dropdown-content {
    position: absolute;
    right: 0;
    top: calc(100% + 0.5rem);
    background: var(--background-color, #ffffff);
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    padding: 0.5rem;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Masonry layout (CSS columns).
     Real masonry stacking, no overlaps, minimal JS. */
  .routines-masonry {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
    width: 100%;
  }

  .masonry-column {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 1rem;
  }

  .routine-card {
    display: block;
    width: 100%;
    position: relative;
    z-index: 0;
    overflow: visible;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 0.5rem;
    padding: 0.75rem;
    transition: all 0.2s;
  }

  .routine-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  /* Ensure overlays in a card can render above neighboring cards/columns.
     This prevents hover/focus flicker when a dropdown overlaps another card. */
  .routine-card:hover,
  .routine-card:focus-within {
    z-index: 50;
  }

  .exercise-item[open] {
    position: relative;
    z-index: 60;
  }

  .routine-card h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    color: var(--heading-color);
  }

  .exercises {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .exercise-item {
    position: relative;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.375rem;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  .exercise-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
    list-style: none;
  }

  .exercise-header::-webkit-details-marker {
    display: none;
  }

  .exercise-title {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--heading-color);
  }

  .set-count {
    font-size: 0.8125rem;
    color: var(--link-color);
    font-weight: 600;
    opacity: 0.85;
  }

  .exercise-notes {
    font-size: 0.8125rem;
    font-style: italic;
    opacity: 0.75;
    padding: 0.25rem 0.375rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.25rem;
  }

  .exercise-dropdown {
    min-width: 220px;
    max-width: 280px;
  }

  .sets-grid {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  @media (max-width: 768px) {
    /* Render exercise details inline on mobile to keep them inside the modal. */
    .exercise-item > .exercise-dropdown.dropdown-content {
      position: static;
      top: auto;
      right: auto;
      box-shadow: none;
      margin-top: 0.5rem;
    }

    .exercise-dropdown {
      min-width: 0;
      max-width: none;
    }

  }

  .set-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 0.25rem;
    font-size: 0.8125rem;
  }

  .set-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: var(--link-color);
    color: white;
    border-radius: 50%;
    font-weight: 600;
    font-size: 0.6875rem;
    flex-shrink: 0;
  }

  .set-details {
    flex: 1;
    font-weight: 500;
  }

  .set-rpe {
    font-size: 0.6875rem;
    padding: 0.125rem 0.375rem;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 0.25rem;
    font-weight: 600;
  }

  .no-exercises {
    font-size: 0.875rem;
    color: #9ca3af;
    font-style: italic;
    text-align: center;
    padding: 2rem;
  }

  @media (max-width: 768px) {
    .stats-header {
      flex-direction: column;
    }

    .stat-card {
      min-width: unset;
      width: 100%;
    }

  }

  @media (prefers-color-scheme: dark) {
    .stat-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .data-source {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }


    .routine-card {
      background: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .routine-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .spinner {
      border-color: rgba(255, 255, 255, 0.1);
      border-left-color: var(--link-color);
    }

    .exercise-item {
      background: rgba(255, 255, 255, 0.02);
      border-color: rgba(255, 255, 255, 0.05);
    }

    .exercise-notes {
      background: rgba(255, 255, 255, 0.02);
    }

    .set-item {
      background: rgba(255, 255, 255, 0.05);
    }

    .set-rpe {
      background: rgba(255, 255, 255, 0.1);
    }
  }
</style>

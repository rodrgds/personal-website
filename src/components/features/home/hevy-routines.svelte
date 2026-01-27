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

  interface Workout {
    title: string;
    startTime: string;
    endTime: string;
  }

  interface WorkoutStats {
    workoutCount: number;
    recentWorkouts: Workout[];
  }

  let routines = $state<Routine[]>([]);
  let stats = $state<WorkoutStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let rootEl: HTMLDivElement | null = $state(null);
  let openDetailsId = $state<string | null>(null);

  // Helper function to format date
  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Helper function to format relative time
  function getRelativeTime(isoDate: string): string {
    const workoutDate = new Date(isoDate);
    const now = new Date();

    // Reset both dates to start of day in local timezone for accurate day comparison
    const workoutDay = new Date(
      workoutDate.getFullYear(),
      workoutDate.getMonth(),
      workoutDate.getDate(),
    );
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffMs = today.getTime() - workoutDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
    }
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }

  function formatWorkoutDuration(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
  ): string | null {
    if (!startTime || !endTime) return null;

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    const diffMs = end - start;
    if (diffMs <= 0) return null;

    const totalMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) return `${totalMinutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }

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
</script>

<div class="hevy-routines" bind:this={rootEl}>
  {#snippet WorkoutRow(workout: Workout)}
    {@const duration = formatWorkoutDuration(
      workout.startTime,
      workout.endTime,
    )}
    <div class="workout-item">
      <div class="workout-title">{workout.title}</div>
      <div class="workout-date">
        {formatDate(workout.startTime)} • {getRelativeTime(workout.startTime)}
        {#if duration}
          • {duration}
        {/if}
      </div>
    </div>
  {/snippet}

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
        {#if stats.recentWorkouts && stats.recentWorkouts.length > 0}
          <div class="stat-card workouts-card">
            <div class="workouts-header">
              <div class="stat-label">Recent Workouts</div>
              {#if stats.recentWorkouts.length > 1}
                <details
                  class="more-workouts"
                  data-dd-id="recent-workouts"
                  ontoggle={(e) => handleDetailsToggle("recent-workouts", e)}
                >
                  <summary class="more-workouts-summary">
                    Show {stats.recentWorkouts.length - 1} more
                  </summary>
                  <div class="more-workouts-content dropdown-content">
                    {#each stats.recentWorkouts.slice(1) as workout}
                      {@render WorkoutRow(workout)}
                    {/each}
                  </div>
                </details>
              {/if}
            </div>
            <div class="recent-workouts">
              {#each stats.recentWorkouts.slice(0, 1) as workout}
                {@render WorkoutRow(workout)}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    {#if routines.length === 0}
      <div class="empty">
        <p>No routines found in your "Current" folder.</p>
        <p class="hint">Add some routines to the "Current" folder in Hevy!</p>
      </div>
    {:else}
      <div class="routines-masonry">
        {#each routines as routine}
          <div class="routine-card">
            <h3>{routine.title}</h3>
            {#if routine.exercises && routine.exercises.length > 0}
              <div class="exercises">
                {#each routine.exercises as exercise, exIdx}
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
                            {#each exercise.sets as set, idx}
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

  .workouts-card {
    flex: 1;
    min-width: 300px;
  }

  .workouts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
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

  .recent-workouts {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .workout-item {
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 0.25rem;
  }

  .workout-title {
    font-weight: 600;
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .workout-date {
    font-size: 0.75rem;
    opacity: 0.7;
  }
  .more-workouts {
    position: relative;
  }

  .more-workouts-summary {
    cursor: pointer;
    user-select: none;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--link-color);
    list-style: none;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    background: rgba(0, 0, 0, 0.02);
    transition: background 0.2s;
  }

  .more-workouts-summary:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  .more-workouts-summary::-webkit-details-marker {
    display: none;
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

  .more-workouts-content {
    min-width: 280px;
    max-width: 320px;
  }
  /* Masonry layout (CSS columns).
     Real masonry stacking, no overlaps, minimal JS. */
  .routines-masonry {
    column-count: 1;
    column-gap: 1.5rem;
    width: 100%;
  }

  @media (min-width: 600px) {
    .routines-masonry {
      column-count: 2;
    }
  }

  .routine-card {
    display: inline-block;
    width: 100%;
    margin: 0 0 1rem;
    position: relative;
    z-index: 0;
    overflow: visible;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 0.5rem;
    padding: 0.75rem;
    transition: all 0.2s;
    break-inside: avoid;
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

  .exercise-item[open],
  .more-workouts[open] {
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
    /* On mobile: keep Recent Workouts as a true dropdown overlay,
       but render exercise details inline to avoid going off-screen. */
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

    .more-workouts-content.dropdown-content {
      position: absolute;
      right: 0;
      left: auto;
      width: min(320px, calc(100vw - 2rem));
      max-width: calc(100vw - 2rem);
    }

    .more-workouts-content {
      min-width: 0;
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

    .workouts-card {
      min-width: unset;
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

    .workout-item {
      background: rgba(255, 255, 255, 0.02);
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

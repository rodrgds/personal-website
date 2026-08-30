<script lang="ts">
  import { actions } from "astro:actions";

  import type { MuscleTraining } from "../../../lib/hevy-muscles";
  import MuscleHeatmap from "./MuscleHeatmap.svelte";

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
    recentWorkouts: Workout[];
    musclePeriodDays: number;
    muscleDataAvailable: boolean;
    muscles: MuscleTraining[];
  }

  interface Workout {
    title: string;
    startTime: string;
    endTime: string;
  }

  let routines: Routine[] = $state([]);
  let stats: WorkoutStats | null = $state(null);
  let loading = $state(true);
  let error: string | null = $state(null);

  let rootEl: HTMLDivElement | null = $state(null);
  let openDetailsId: string | null = $state(null);

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getRelativeTime(isoDate: string): string {
    const workoutDate = new Date(isoDate);
    const now = new Date();
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

  function formatSet(set: Set): string {
    if (set.weight_kg !== undefined && set.weight_kg > 0 && set.reps) {
      return `${set.weight_kg}kg × ${set.reps}`;
    }
    if (set.reps && !set.weight_kg) {
      return `${set.reps} reps`;
    }
    if (set.duration_seconds) {
      const mins = Math.floor(set.duration_seconds / 60);
      const secs = set.duration_seconds % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    if (set.distance_meters) {
      return `${set.distance_meters}m`;
    }
    return "-";
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
    if (!(e.currentTarget instanceof HTMLDetailsElement)) return;
    const details = e.currentTarget;

    if (details.open) {
      openDetailsId = id;
      closeAllDetailsExcept(id);
      return;
    }

    if (openDetailsId === id) {
      openDetailsId = null;
    }
  }

  // Masonry columns: place each routine in whichever column currently has the
  // least estimated height, which keeps columns visually balanced regardless
  // of how many exercises each routine contains.
  function greedyColumns<T>(
    items: T[],
    numCols: number,
    estimateHeight: (item: T) => number,
  ): T[][] {
    const cols: T[][] = Array.from({ length: numCols }, () => []);
    const heights = Array.from({ length: numCols }, () => 0);

    for (const item of items) {
      const shortestCol = heights.indexOf(Math.min(...heights));
      cols[shortestCol].push(item);
      heights[shortestCol] += estimateHeight(item);
    }

    return cols;
  }

  // Height estimates in arbitrary units; only relative values matter.
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
  {#snippet WorkoutRow(workout: Workout)}
    {@const duration = formatWorkoutDuration(
      workout.startTime,
      workout.endTime,
    )}
    <li class="workout-item">
      <div class="workout-title">{workout.title}</div>
      <div class="workout-date">
        {formatDate(workout.startTime)} • {getRelativeTime(workout.startTime)}
        {#if duration}
          • {duration}
        {/if}
      </div>
    </li>
  {/snippet}

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading routines...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={loadRoutines} class="retry-button">Retry</button>
    </div>
  {:else}
    <div class="data-source">
      <img src="/logos/hevy.png" alt="Hevy" class="source-logo" />
      <span class="source-text"
        >Data automatically tracked from my Hevy account</span
      >
    </div>

    {#if stats}
      <div class="workout-overview">
        <MuscleHeatmap
          muscles={stats.muscles}
          periodDays={stats.musclePeriodDays}
          dataAvailable={stats.muscleDataAvailable}
        />
        {#if stats.recentWorkouts && stats.recentWorkouts.length > 0}
          <section class="recent-workouts-panel" aria-labelledby="recent-workouts-title">
            <h3 id="recent-workouts-title">Recent workouts</h3>
            <ul class="recent-workouts">
              {#each stats.recentWorkouts.slice(0, 3) as workout (workout.startTime)}
                {@render WorkoutRow(workout)}
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/if}

    {#if routines.length === 0}
      <div class="empty">
        <p>No routines in the "Current" folder right now.</p>
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
    color: var(--error);
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

  .workout-overview {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(15rem, 0.65fr);
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .recent-workouts-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .recent-workouts-panel h3 {
    margin: 0 0 0.35rem;
    color: var(--heading-color);
    font-size: 1rem;
  }

  .recent-workouts {
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border-color);
    list-style: none;
  }

  .workout-item {
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--border-color);
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
    .workout-overview {
      grid-template-columns: 1fr;
    }

    .recent-workouts-panel {
      order: -1;
    }
  }

  @media (prefers-color-scheme: dark) {
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

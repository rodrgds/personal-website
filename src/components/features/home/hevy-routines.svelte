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
      <span class="workout-date">{formatDate(workout.startTime).toLowerCase()}</span>
      <span class="workout-title">{workout.title.toLowerCase()}</span>
      <span class="workout-meta"
        >{getRelativeTime(workout.startTime).toLowerCase()}{duration
          ? ` · ${duration}`
          : ""}</span
      >
    </li>
  {/snippet}

  {#if loading}
    <div class="loading">
      <p><span class="ascii-spinner" aria-hidden="true">⠋</span> loading routines...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={loadRoutines} class="retry-button" data-cuelume-tap
        >Retry</button
      >
    </div>
  {:else}
    {#if stats}
      <div class="workout-overview">
        <MuscleHeatmap
          muscles={stats.muscles}
          periodDays={stats.musclePeriodDays}
          dataAvailable={stats.muscleDataAvailable}
        />
        {#if stats.recentWorkouts && stats.recentWorkouts.length > 0}
          <section class="recent-workouts-panel" aria-labelledby="recent-workouts-title">
            <h3 id="recent-workouts-title">tail -n 5 workouts.log</h3>
            <ul class="recent-workouts">
              {#each stats.recentWorkouts.slice(0, 5) as workout (workout.startTime)}
                {@render WorkoutRow(workout)}
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/if}

    {#if routines.length === 0}
      <div class="empty">
        <p>ls: ~/routines/current: empty right now</p>
      </div>
    {:else}
      <div class="routines-masonry">
        {#each routineColumns as column, columnIndex (columnIndex)}
          <div class="masonry-column">
            {#each column as routine (routine.id)}
              <div class="routine-card">
                <h3>{routine.title.toLowerCase()}</h3>
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
    font-size: 0.8rem;
  }

  .loading p,
  .empty p {
    margin: 0;
    color: var(--gray-color);
  }

  .error p {
    margin: 0 0 0.5rem;
    color: var(--flexoki-red);
  }

  .retry-button {
    padding: 0 0.3rem;
    border: 0;
    background: none;
    color: var(--link-color);
    font: inherit;
    cursor: pointer;
  }

  .retry-button::before {
    content: "[";
  }

  .retry-button::after {
    content: "]";
  }

  .workout-overview {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
    margin-bottom: 1rem;
  }

  .workout-overview > :global(*) {
    min-width: 0;
  }

  .recent-workouts-panel h3,
  .routine-card h3 {
    margin: 0 0 0.4rem;
    color: var(--gray-color);
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 400;
  }

  .routine-card h3 {
    color: var(--heading-color);
    font-weight: 700;
  }

  .routine-card h3::before {
    color: var(--tc-heading);
    content: "## ";
  }

  .recent-workouts {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .workout-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0 1ch;
    margin: 0;
    padding: 0.25rem 0;
    border-bottom: 1px dashed var(--border-color);
  }

  .workout-date {
    color: var(--tc-date);
  }

  .workout-title {
    color: var(--heading-color);
  }

  .workout-meta {
    grid-column: 2;
    color: var(--gray-color);
  }

  .routines-masonry {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .masonry-column {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .routine-card {
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border-color);
    background: var(--background-color);
  }

  .exercises {
    display: flex;
    flex-direction: column;
  }

  .exercise-item {
    position: relative;
  }

  .exercise-header {
    display: flex;
    gap: 1ch;
    align-items: baseline;
    padding: 0.15rem 0.2rem;
    cursor: pointer;
    list-style: none;
  }

  .exercise-header::-webkit-details-marker {
    display: none;
  }

  .exercise-header:hover,
  .exercise-item[open] > .exercise-header {
    background: var(--surface-hover);
  }

  .exercise-title {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A dotted leader runs from the name to the set count. */
  .exercise-header::after {
    flex: 1;
    order: 1;
    border-bottom: 1px dotted var(--border-color);
    content: "";
  }

  .set-count {
    flex: none;
    order: 2;
    color: var(--tc-date);
  }

  .dropdown-content {
    margin: 0.2rem 0 0.4rem 2ch;
    padding-left: 1ch;
    border-left: 1px solid var(--tc-path);
  }

  .exercise-notes {
    margin-bottom: 0.3rem;
    color: var(--gray-color);
    white-space: pre-wrap;
  }

  .exercise-notes::before {
    content: "# ";
  }

  .sets-grid {
    display: grid;
    gap: 0.05rem;
  }

  .set-item {
    display: flex;
    gap: 1ch;
  }

  .set-number {
    width: 2ch;
    color: var(--gray-color);
  }

  .set-details {
    color: var(--text-color);
  }

  .set-rpe {
    margin-left: auto;
    color: var(--tc-tag);
  }

  .no-exercises {
    margin: 0;
    color: var(--gray-color);
  }

  @media (max-width: 768px) {
    .workout-overview {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

<script lang="ts">
  import {
    BACK_MUSCLES,
    FRONT_MUSCLES,
    type MuscleDef,
  } from "body-muscles";

  import type {
    HevyMuscleGroup,
    MuscleTraining,
  } from "../../../lib/hevy-muscles";

  interface Props {
    muscles: MuscleTraining[];
    periodDays: number;
    dataAvailable: boolean;
  }

  interface BodyView {
    label: string;
    viewBox: string;
    regions: MuscleDef[];
  }

  const BODY_VIEWS: BodyView[] = [
    { label: "Front", viewBox: "0 0 35 93", regions: FRONT_MUSCLES },
    { label: "Back", viewBox: "37 0 35 93", regions: BACK_MUSCLES },
  ];

  const REGION_PREFIXES: Array<{
    group: HevyMuscleGroup;
    prefixes: string[];
  }> = [
    {
      group: "abdominals",
      prefixes: ["abs-", "obliques-", "serratus-anterior-"],
    },
    {
      group: "shoulders",
      prefixes: ["shoulder-", "deltoid-rear-"],
    },
    { group: "biceps", prefixes: ["biceps-"] },
    { group: "triceps", prefixes: ["triceps-"] },
    {
      group: "forearms",
      prefixes: ["forearm-", "forearm-flexors-", "forearm-extensors-"],
    },
    { group: "quadriceps", prefixes: ["quads-"] },
    { group: "hamstrings", prefixes: ["hamstrings-"] },
    { group: "calves", prefixes: ["calves-", "tibialis-anterior-"] },
    { group: "glutes", prefixes: ["gluteus-maximus-"] },
    { group: "abductors", prefixes: ["gluteus-medius-"] },
    { group: "adductors", prefixes: ["adductors-"] },
    { group: "lats", prefixes: ["lats-"] },
    {
      group: "upper_back",
      prefixes: ["traps-mid-", "traps-lower-"],
    },
    { group: "traps", prefixes: ["traps-upper-"] },
    {
      group: "lower_back",
      prefixes: ["lower-back-", "spine"],
    },
    { group: "chest", prefixes: ["chest-"] },
    { group: "neck", prefixes: ["neck-", "nape"] },
  ];

  const KEYBOARD_REGION_BY_GROUP = {
    abdominals: "abs-upper-left",
    shoulders: "shoulder-front-left",
    biceps: "biceps-left",
    triceps: "triceps-long-left",
    forearms: "forearm-left",
    quadriceps: "quads-left",
    hamstrings: "hamstrings-medial-left",
    calves: "calves-gastroc-medial-left",
    glutes: "gluteus-maximus-left",
    abductors: "gluteus-medius-left",
    adductors: "adductors-left",
    lats: "lats-upper-left",
    upper_back: "traps-mid-left",
    traps: "traps-upper-left",
    lower_back: "lower-back-erectors-left",
    chest: "chest-upper-left",
    neck: "neck-left",
  } satisfies Record<HevyMuscleGroup, string>;

  let { muscles, periodDays, dataAvailable }: Props = $props();
  let selectedGroup: HevyMuscleGroup | null = $state(null);
  let selectedRegionId: string | null = $state(null);
  let selectedRegionName: string | null = $state(null);

  let muscleByGroup = $derived(
    new Map(muscles.map((muscle) => [muscle.group, muscle])),
  );
  let mostTrained = $derived(
    muscles.reduce<MuscleTraining | null>((highest, muscle) => {
      if (!highest || muscle.exposure > highest.exposure) return muscle;
      return highest;
    }, null),
  );
  let activeMuscle = $derived(
    selectedGroup
      ? (muscleByGroup.get(selectedGroup) ?? null)
      : selectedRegionName
        ? null
        : mostTrained,
  );

  function muscleGroupForRegion(regionId: string): HevyMuscleGroup | null {
    for (const entry of REGION_PREFIXES) {
      if (entry.prefixes.some((prefix) => regionId.startsWith(prefix))) {
        return entry.group;
      }
    }
    return null;
  }

  function workoutLabel(count: number): string {
    return `${count} workout${count === 1 ? "" : "s"}`;
  }

  function isKeyboardRegion(
    group: HevyMuscleGroup | null,
    regionId: string,
  ): boolean {
    return group !== null && KEYBOARD_REGION_BY_GROUP[group] === regionId;
  }

  function selectRegion(
    group: HevyMuscleGroup | null,
    regionId: string,
    regionName: string,
  ): void {
    selectedGroup = group;
    selectedRegionId = regionId;
    selectedRegionName = regionName;
  }

  function handleRegionKeydown(
    event: KeyboardEvent,
    group: HevyMuscleGroup | null,
    regionId: string,
    regionName: string,
  ): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectRegion(group, regionId, regionName);
  }
</script>

<section class="muscle-heatmap" aria-labelledby="muscle-heatmap-title">
  <header class="heatmap-header">
    <div>
      <h3 id="muscle-heatmap-title">Muscles trained</h3>
      <p>Last {Math.round(periodDays / 7)} weeks</p>
    </div>
    <div class="legend" aria-label="Training frequency, less to more">
      <span>Less</span>
      {#each [0, 1, 2, 3, 4] as level}
        <span class="legend-cell" data-level={level}></span>
      {/each}
      <span>More</span>
    </div>
  </header>

  <div class="body-views">
    {#each BODY_VIEWS as view (view.label)}
      <figure>
        <svg
          viewBox={view.viewBox}
          role="group"
          aria-label={`${view.label} body muscle map`}
        >
          {#each view.regions as region (region.id)}
            {@const group = muscleGroupForRegion(region.id)}
            {@const training = group ? muscleByGroup.get(group) : null}
            {@const keyboardRegion = isKeyboardRegion(group, region.id)}
            <path
              d={region.path}
              data-region={region.id}
              data-level={training?.level ?? 0}
              data-tracked={group !== null}
              data-selected={(group !== null && selectedGroup === group) ||
                (group === null && selectedRegionId === region.id)}
              tabindex={keyboardRegion ? 0 : undefined}
              role="button"
              aria-hidden={keyboardRegion ? undefined : true}
              aria-label={keyboardRegion && training
                ? `${training.label}, ${workoutLabel(training.workouts)}`
                : undefined}
              onpointerenter={() =>
                selectRegion(group, region.id, region.name)}
              onclick={() => selectRegion(group, region.id, region.name)}
              onfocus={() => selectRegion(group, region.id, region.name)}
              onkeydown={(event) =>
                handleRegionKeydown(event, group, region.id, region.name)}
            >
              {#if training}
                <title>{training.label}: {workoutLabel(training.workouts)}</title>
              {:else}
                <title>{region.name}: not tracked separately by Hevy</title>
              {/if}
            </path>
          {/each}
        </svg>
        <figcaption>{view.label}</figcaption>
      </figure>
    {/each}
  </div>

  <div class="heatmap-detail" aria-live="polite">
    {#if activeMuscle}
      <strong>{activeMuscle.label}</strong>
      <span>{workoutLabel(activeMuscle.workouts)}</span>
    {:else if selectedRegionName}
      <strong>{selectedRegionName}</strong>
      <span>Not tracked separately by Hevy.</span>
    {:else if dataAvailable}
      <strong>No recent workouts</strong>
      <span>Nothing recorded in this period.</span>
    {:else}
      <strong>No recent muscle data</strong>
      <span>The map will fill after the next Hevy sync.</span>
    {/if}
  </div>

  <ul class="sr-only">
    {#each muscles.filter((muscle) => muscle.workouts > 0) as muscle (muscle.group)}
      <li>{muscle.label}: {workoutLabel(muscle.workouts)}</li>
    {/each}
  </ul>
</section>

<style>
  .muscle-heatmap {
    --heat-0: color-mix(
      in srgb,
      var(--text-muted) 14%,
      var(--background-color)
    );
    --heat-1: color-mix(
      in srgb,
      var(--link-color) 28%,
      var(--background-color)
    );
    --heat-2: color-mix(
      in srgb,
      var(--link-color) 50%,
      var(--background-color)
    );
    --heat-3: color-mix(
      in srgb,
      var(--link-color) 74%,
      var(--background-color)
    );
    --heat-4: var(--link-color);

    display: flex;
    flex-direction: column;
    min-height: 22rem;
    padding: 1rem 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
  }

  .heatmap-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .heatmap-header h3 {
    margin: 0;
    color: var(--heading-color);
    font-size: 1rem;
  }

  .heatmap-header p {
    margin: 0.15rem 0 0;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-muted);
    font-size: 0.6875rem;
  }

  .legend-cell {
    width: 0.65rem;
    height: 0.65rem;
    border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
    border-radius: 0.12rem;
  }

  .legend-cell[data-level="0"],
  path[data-level="0"] {
    fill: var(--heat-0);
  }

  .legend-cell[data-level="0"] {
    background: var(--heat-0);
  }

  path[data-level="1"] {
    fill: var(--heat-1);
  }

  .legend-cell[data-level="1"] {
    background: var(--heat-1);
  }

  path[data-level="2"] {
    fill: var(--heat-2);
  }

  .legend-cell[data-level="2"] {
    background: var(--heat-2);
  }

  path[data-level="3"] {
    fill: var(--heat-3);
  }

  .legend-cell[data-level="3"] {
    background: var(--heat-3);
  }

  path[data-level="4"] {
    fill: var(--heat-4);
  }

  .legend-cell[data-level="4"] {
    background: var(--heat-4);
  }

  .body-views {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    flex: 1;
    gap: 0.75rem;
    min-height: 0;
    padding: 0.75rem 0 0.35rem;
  }

  figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    margin: 0;
  }

  svg {
    width: 100%;
    height: 14.5rem;
    overflow: visible;
  }

  path {
    cursor: help;
    stroke: color-mix(in srgb, var(--background-color) 82%, var(--text-muted));
    stroke-width: 0.12;
    transition:
      fill 180ms ease-out,
      stroke 180ms ease-out;
  }

  path[data-tracked="true"] {
    cursor: pointer;
  }

  path:hover,
  path[data-selected="true"] {
    stroke: var(--heading-color);
    stroke-width: 0.25;
  }

  path:focus {
    outline: none;
  }

  path:focus-visible {
    stroke: var(--heading-color);
    stroke-width: 0.45;
  }

  figcaption {
    margin-top: 0.15rem;
    color: var(--text-muted);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .heatmap-detail {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.4rem;
    min-height: 1.25rem;
    font-size: 0.8125rem;
  }

  .heatmap-detail strong {
    color: var(--heading-color);
  }

  .heatmap-detail span {
    color: var(--text-muted);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 480px) {
    .muscle-heatmap {
      min-height: 19rem;
      padding: 0.85rem;
    }

    .heatmap-header {
      align-items: flex-end;
    }

    svg {
      height: 12rem;
    }

    .heatmap-detail {
      flex-direction: column;
      align-items: center;
      gap: 0.05rem;
      text-align: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    path {
      transition: none;
    }
  }
</style>

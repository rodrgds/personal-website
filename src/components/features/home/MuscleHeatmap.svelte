<script lang="ts">
  import "./muscle-heatmap.css";

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

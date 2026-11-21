<script lang="ts">
  import { blockBar } from "../../../lib/terminal/ascii";
  import {
    formatAmount,
    formatValue,
    type ActivitySource,
  } from "./metrics";
  import type { ActivityBucket } from "./periods";

  interface Props {
    buckets: ActivityBucket[];
    source: ActivitySource;
    /** Header of the first column: the grouping, e.g. "month". */
    grain: string;
    today: string;
    /** Opens a bucket as its own period; null when there is nothing finer. */
    onOpen: ((bucket: ActivityBucket) => void) | null;
  }

  let { buckets, source, grain, today, onOpen }: Props = $props();

  // The bars are text, like htop's meters: as many cells as the column holds.
  let barWidth = $state(0);
  let probeWidth = $state(0);
  let cells = $derived(
    barWidth > 0 && probeWidth > 0
      ? Math.max(4, Math.floor(barWidth / (probeWidth / 10)))
      : 24,
  );
  let maximum = $derived(Math.max(0, ...buckets.map((bucket) => bucket.value)));
  let bestKey = $derived(
    buckets.length > 1 && maximum > 0
      ? buckets.find((bucket) => bucket.value === maximum)?.key
      : undefined,
  );

  function describe(bucket: ActivityBucket): string {
    const running = isRunning(bucket) ? ", so far" : "";
    return `${bucket.label}: ${formatValue(source, bucket.value)}, ${bucket.activeDays} of ${bucket.days} days active${running}`;
  }

  function isRunning(bucket: ActivityBucket): boolean {
    return bucket.start <= today && today <= bucket.end;
  }
</script>

<div class="rows" class:daily={grain === "day"}>
  <span class="probe" aria-hidden="true" bind:clientWidth={probeWidth}
    >0000000000</span
  >
  <div class="row head" aria-hidden="true">
    <span>S</span>
    <span>{grain.toUpperCase()}</span>
    <span class="bar-col" bind:clientWidth={barWidth}>ACTIVITY</span>
    <span class="num">TOTAL</span>
    {#if grain !== "day"}<span class="num">DAYS</span>{/if}
  </div>
  <ol>
    {#each buckets as bucket (bucket.key)}
      {@const fraction = maximum > 0 ? bucket.value / maximum : 0}
      {#snippet cellsOf()}
        <span class="state" title={isRunning(bucket) ? "in progress" : undefined}
          >{isRunning(bucket) ? "R" : ""}</span
        >
        <span class="label">{bucket.shortLabel}</span>
        <span class="bar">{blockBar(fraction, cells).trimEnd()}</span>
        <span class="num total">{formatAmount(source, bucket.value)}</span>
        {#if grain !== "day"}
          <span class="num days">{bucket.activeDays}/{bucket.days}</span>
        {/if}
      {/snippet}
      <li
        class:zero={bucket.value === 0}
        class:best={bucket.key === bestKey}
        class:running={isRunning(bucket)}
      >
        {#if onOpen}
          <button
            type="button"
            class="row"
            aria-label={`${describe(bucket)}. open`}
            onclick={() => onOpen(bucket)}>{@render cellsOf()}</button
          >
        {:else}
          <div class="row" role="img" aria-label={describe(bucket)}>
            {@render cellsOf()}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .rows {
    position: relative;
    font-variant-numeric: tabular-nums;
  }

  .probe {
    position: absolute;
    visibility: hidden;
    white-space: pre;
    pointer-events: none;
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    margin: 0;
    padding: 0;
  }

  .row {
    display: grid;
    width: 100%;
    grid-template-columns: 1ch 7ch minmax(0, 1fr) 8ch 7ch;
    gap: 0 1ch;
    align-items: center;
    margin: 0;
    padding: 0.05rem 0.9rem;
    border: 0;
    background: transparent;
    color: var(--text-color);
    font: inherit;
    line-height: 1.5;
    text-align: left;
  }

  /* One day per row: the active-days column would always read 1/1. */
  .daily .row {
    grid-template-columns: 1ch 7ch minmax(0, 1fr) 8ch;
  }

  .head {
    padding-block: 0.2rem;
    background: var(--tc-host);
    color: var(--background-color);
    font-weight: 700;
  }

  .head .bar-col {
    min-width: 0;
    overflow: hidden;
  }

  button.row {
    cursor: pointer;
  }

  button.row:hover,
  button.row:focus-visible {
    background: var(--tc-selection);
  }

  button.row:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  .num {
    text-align: right;
  }

  .label,
  .bar {
    overflow: hidden;
    white-space: pre;
  }

  .bar {
    color: var(--metric);
  }

  .state {
    color: var(--tc-live);
    font-weight: 700;
  }

  .days {
    color: var(--gray-color);
  }

  .zero .label,
  .zero .total {
    color: var(--gray-color);
  }

  .running .label {
    color: var(--tc-live);
  }

  .best .total {
    color: var(--heading-color);
    font-weight: 700;
  }

  @media (max-width: 480px) {
    .row {
      grid-template-columns: 1ch 6ch minmax(0, 1fr) 7ch 7ch;
      padding-inline: 0.6rem;
    }

    .daily .row {
      grid-template-columns: 1ch 6ch minmax(0, 1fr) 7ch;
    }
  }
</style>

<script lang="ts">
  import Logo from "./Logo.svelte";
  import { START_NODE, nodeById, isPlanId } from "./flow";
  import { planById } from "./plans";

  /** Each entry is a question id plus the answer taken from it. */
  type Answer = { nodeId: string; yes: boolean };

  let trail = $state<Answer[]>([]);

  const currentId = $derived.by(() => {
    let id = START_NODE;
    for (const answer of trail) {
      const node = nodeById(answer.nodeId);
      id = answer.yes ? node.yes : node.no;
    }
    return id;
  });

  const plan = $derived(isPlanId(currentId) ? planById(currentId) : null);
  const node = $derived(plan === null ? nodeById(currentId) : null);

  function answer(yes: boolean) {
    if (node === null) return;
    trail = [...trail, { nodeId: node.id, yes }];
  }

  function back() {
    trail = trail.slice(0, -1);
  }

  function restart() {
    trail = [];
  }
</script>

<div class="chart">
  {#each trail as step, index (index)}
    <div class="done">
      <p class="done-question">{nodeById(step.nodeId).question}</p>
      <p class="done-answer">{step.yes ? "Yes" : "No"}</p>
    </div>
    <div class="stem" aria-hidden="true"></div>
  {/each}

  {#if plan}
    <div class="verdict" aria-live="polite">
      <div class="badge">
        <Logo id={plan.id} />
      </div>
      <h2>{plan.name}</h2>
      <p class="price">{plan.price}</p>
      <p class="why">{plan.why}</p>
      <p class="links">
        <a href={plan.url} target="_blank" rel="noopener noreferrer">Pricing</a>
        <button type="button" onclick={restart}>Start over</button>
      </p>
    </div>
  {:else if node}
    <div class="ask" aria-live="polite">
      <h2>{node.question}</h2>
      <div class="answers">
        <button type="button" onclick={() => answer(true)}>Yes</button>
        <button type="button" onclick={() => answer(false)}>No</button>
      </div>
      {#if trail.length > 0}
        <button class="back" type="button" onclick={back}>Back</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .chart {
    display: flex;
    max-width: 26rem;
    margin: 2.5rem 0 0;
    flex-direction: column;
  }

  .done {
    display: grid;
    gap: 0.1rem;
  }

  .done-question {
    margin: 0;
    color: var(--gray-color);
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .done-answer {
    margin: 0;
    color: var(--heading-color);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .stem {
    width: 1px;
    height: 1.1rem;
    margin: 0.4rem 0 0.4rem 0.35rem;
    background: var(--border-color);
  }

  .ask h2 {
    margin: 0 0 1.5rem;
    font-family: var(--font-family-serif);
    font-size: 1.9rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--heading-color);
    text-wrap: balance;
  }

  .answers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }

  .answers button {
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: transparent;
    color: var(--text-color);
    font-family: inherit;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .answers button:hover {
    border-color: var(--link-color);
    background: var(--bg-secondary);
  }

  .answers button:focus-visible,
  .back:focus-visible,
  .links button:focus-visible {
    outline: 2px solid var(--link-color);
    outline-offset: 2px;
  }

  .back {
    margin-top: 1.25rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--gray-color);
    font-family: inherit;
    font-size: 0.85rem;
    text-decoration: underline;
    cursor: pointer;
  }

  .back:hover {
    color: var(--link-color);
  }

  .verdict {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .badge {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 1.25rem;
    color: var(--heading-color);
  }

  .verdict h2 {
    margin: 0;
    font-family: var(--font-family-serif);
    font-size: 2.5rem;
    font-weight: 600;
    line-height: 1.05;
    color: var(--heading-color);
  }

  .price {
    margin: 0.35rem 0 1.25rem;
    color: var(--gray-color);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .why {
    margin: 0 0 1.5rem;
    font-size: 1.1rem;
    line-height: 1.5;
  }

  .links {
    display: flex;
    gap: 1.5rem;
    margin: 0;
    font-size: 0.95rem;
  }

  .links button {
    padding: 0;
    border: 0;
    background: none;
    color: var(--gray-color);
    font-family: inherit;
    font-size: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .links button:hover {
    color: var(--link-color);
  }

  @media (max-width: 600px) {
    .chart {
      margin-top: 2rem;
    }

    .ask h2 {
      font-size: 1.6rem;
    }

    .verdict h2 {
      font-size: 2rem;
    }

    .badge {
      width: 2.5rem;
      height: 2.5rem;
    }
  }
</style>

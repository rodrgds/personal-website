<script lang="ts">
  import { FLOW, START_NODE, isPlanId, nodeById } from "./flow";
  import { planById } from "./plans";

  interface Step {
    readonly nodeId: string;
    readonly label: string;
    readonly next: string;
  }

  let steps = $state<Step[]>([]);

  const currentId = $derived(
    steps.length === 0 ? START_NODE : steps[steps.length - 1].next,
  );
  const currentPlan = $derived(isPlanId(currentId) ? planById(currentId) : null);
  const currentNode = $derived(currentPlan === null ? nodeById(currentId) : null);

  function choose(nodeId: string, label: string, next: string) {
    steps = [...steps, { nodeId, label, next }];
  }

  function back() {
    steps = steps.slice(0, -1);
  }

  function restart() {
    steps = [];
  }
</script>

<div class="decide">
  {#if steps.length > 0}
    <ol class="trail">
      {#each steps as step, index (index)}
        <li>
          <span class="trail-answer">{step.label}</span>
        </li>
      {/each}
    </ol>
  {/if}

  {#if currentPlan}
    <section class="verdict" aria-live="polite">
      <p class="eyebrow">{currentPlan.skip ? "Not this one" : "Buy this"}</p>
      <h2>
        {currentPlan.name}
        <span class="price">{currentPlan.price}</span>
      </h2>
      <p class="headline">{currentPlan.headline}</p>
      {#if currentPlan.skip}
        <p class="skip-note">You asked, so here is the honest answer.</p>
      {/if}
      <ul class="why">
        {#each currentPlan.why as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
      <p class="watch">
        <strong>Watch out:</strong>
        {currentPlan.watchOut}
      </p>
      {#if currentPlan.skip}
        <p class="alternative">
          What most people should get instead:
          <strong>{planById(currentPlan.alternate).name}</strong>
          at {planById(currentPlan.alternate).price}.
        </p>
      {/if}
      <p class="links">
        <a href={currentPlan.url} target="_blank" rel="noopener noreferrer">
          Official pricing
        </a>
        <button type="button" on:click={restart}>Start over</button>
      </p>
    </section>
  {:else if currentNode}
    <section class="question">
      <p class="eyebrow">Question {steps.length + 1}</p>
      <h2>{currentNode.question}</h2>
      <p class="hint">{currentNode.hint}</p>
      <div class="options">
        {#each currentNode.options as option (option.label)}
          <button type="button" on:click={() => choose(currentNode.id, option.label, option.next)}>
            {option.label}
          </button>
        {/each}
      </div>
      {#if steps.length > 0}
        <button class="back" type="button" on:click={back}>Back</button>
      {/if}
    </section>
  {/if}
</div>

<style>
  .decide {
    margin: 2rem 0 0;
  }

  .trail {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
    margin: 0 0 1.75rem;
    padding: 0;
    list-style: none;
    color: var(--gray-color);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .trail li::after {
    content: "→";
    margin-left: 0.75rem;
    opacity: 0.5;
  }

  .trail li:last-child::after {
    content: "";
    margin: 0;
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    color: var(--gray-color);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0 0 0.6rem;
    font-family: var(--font-family-serif);
    font-size: 1.45rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--heading-color);
  }

  .price {
    display: inline-block;
    margin-left: 0.5rem;
    color: var(--gray-color);
    font-family: var(--font-family);
    font-size: 0.95rem;
    font-weight: 500;
  }

  .hint,
  .headline {
    max-width: 36rem;
    margin: 0 0 1.5rem;
    color: var(--text-color);
    line-height: 1.6;
  }

  .options {
    display: grid;
    gap: 0.5rem;
    max-width: 36rem;
  }

  .options button {
    padding: 0.8rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: transparent;
    color: var(--text-color);
    font-family: inherit;
    font-size: 0.98rem;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .options button:hover,
  .options button:focus-visible {
    border-color: var(--link-color);
    background: var(--bg-secondary);
  }

  .options button:focus-visible {
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
    font-size: 0.88rem;
    text-decoration: underline;
    cursor: pointer;
  }

  .back:hover {
    color: var(--link-color);
  }

  .verdict {
    max-width: 40rem;
    padding: 1.5rem 0 0;
    border-top: 1px solid var(--border-color);
  }

  .why {
    margin: 0 0 1.25rem;
    padding-left: 1.1rem;
    line-height: 1.6;
  }

  .why li {
    margin-bottom: 0.6rem;
  }

  .watch {
    margin: 0 0 1rem;
    color: var(--gray-color);
    font-size: 0.93rem;
    line-height: 1.55;
  }

  .watch strong {
    color: var(--text-color);
  }

  .skip-note,
  .alternative {
    margin: 0 0 1rem;
    font-size: 0.93rem;
    line-height: 1.55;
  }

  .skip-note {
    color: var(--error);
  }

  .links {
    display: flex;
    gap: 1.25rem;
    align-items: center;
    margin: 1.5rem 0 0;
    font-size: 0.93rem;
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
    h2 {
      font-size: 1.25rem;
    }

    .price {
      display: block;
      margin: 0.35rem 0 0;
    }
  }
</style>

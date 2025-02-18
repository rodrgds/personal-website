<script>
  let age = $state(0);
  const dateOfBirth = new Date("2006-12-02");

  function calculateInitialAge() {
    const now = new Date();
    const diff = now.getTime() - dateOfBirth.getTime();
    age = diff / 31556952000;
  }

  const timerValue = 50;
  const decreaseBy = timerValue / 31556952000;

  calculateInitialAge();

  let interval = null;

  $effect(() => {
    interval = setInterval(() => {
      age += decreaseBy;
    }, timerValue);
  });

  import { onDestroy } from "svelte";
  onDestroy(() => clearInterval(interval));
</script>

<span>
  {#each age.toFixed(10).split("") as char, i}
    {#if char === "."}
      <span>{char}</span>
    {:else if i < age.toFixed(0).length}
      <span>{char}</span>
    {:else}
      <span style="font-size: {1 - (i - age.toFixed(0).length) * 0.05}em;"
        >{char}</span
      >
    {/if}
  {/each}
</span>

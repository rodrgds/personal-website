<script lang="ts">
  interface Props {
    text: string;
    onclick?: () => void;
  }

  let { text, onclick }: Props = $props();

  function handleClick() {
    onclick?.();
  }
</script>

<button class="interactive-link" onclick={handleClick} type="button">
  {text}
</button>

<style>
  /* Reads like an executable in `ls -F`: green, with a trailing star. */
  .interactive-link {
    display: inline;
    /* Room for the hover highlight that takes no room in the line, so a
       comma after the star sits where it would after plain text. */
    margin: 0 -0.15rem;
    padding: 0 0.15rem;
    border: 0;
    background: none;
    color: var(--tc-host);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .interactive-link::after {
    color: var(--gray-color);
    content: "*";
    font-weight: 400;
  }

  .interactive-link:hover,
  .interactive-link:focus-visible {
    background: var(--tc-host);
    color: var(--background-color);
  }

  .interactive-link:hover::after,
  .interactive-link:focus-visible::after {
    color: inherit;
  }
</style>

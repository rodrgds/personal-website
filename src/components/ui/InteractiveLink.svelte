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
  .interactive-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--link-color);
    cursor: pointer;
    position: relative;
    display: inline;
    text-decoration: none;
    font-weight: inherit;
    transition: all 0.3s ease;
  }

  /* Wavy underline */
  .interactive-link::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -2px;
    width: 100%;
    height: 2px;
    background: linear-gradient(
      90deg,
      var(--link-color) 0%,
      var(--link-color) 50%,
      transparent 50%,
      transparent 100%
    );
    background-size: 6px 2px;
    background-repeat: repeat-x;
    animation:
      wave 1s linear infinite,
      pulse 2s ease-in-out infinite;
  }

  /* Wave animation for the underline */
  @keyframes wave {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 6px 0;
    }
  }

  /* Subtle pulse/blink effect for the text */
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.85;
    }
  }

  /* Add a subtle glow effect */
  .interactive-link::before {
    content: "";
    position: absolute;
    inset: -2px;
    background: var(--link-color);
    opacity: 0;
    filter: blur(8px);
    z-index: -1;
    transition: opacity 0.3s ease;
  }

  .interactive-link:hover::before {
    opacity: 0.2;
    animation: glow 1.5s ease-in-out infinite;
  }

  @keyframes glow {
    0%,
    100% {
      opacity: 0.1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .interactive-link:hover {
    color: var(--link-color);
    transform: translateY(-1px);
  }

  .interactive-link:active {
    transform: translateY(0);
  }

  /* Focus styles for accessibility */
  .interactive-link:focus {
    outline: 2px solid var(--link-color);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .interactive-link:focus:not(:focus-visible) {
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .interactive-link::after {
      animation: none;
    }

    .interactive-link:hover::before {
      animation: none;
    }
  }
</style>

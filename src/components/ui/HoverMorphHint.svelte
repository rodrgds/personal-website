<script lang="ts">
  interface Props {
    idleText: string;
    hoverText: string;
    hovered?: boolean;
    active?: boolean;
  }

  let {
    idleText,
    hoverText,
    hovered = false,
    active = false,
  }: Props = $props();

  const isMorphed = $derived(hovered || active);
</script>

<span class="hover-morph-hint" class:is-morphed={isMorphed} aria-hidden="true">
  <span class="hint-text hint-idle">{idleText}</span>
  <span class="hint-text hint-hover">{hoverText}</span>
</span>

<style>
  .hover-morph-hint {
    position: relative;
    display: inline-grid;
    align-items: center;
    justify-items: start;
    font-family: var(--font-family-mono);
    line-height: 1;
    vertical-align: baseline;
    overflow: visible;
  }

  .hint-text {
    grid-area: 1 / 1;
    transition:
      opacity 0.2s ease,
      transform 0.36s cubic-bezier(0.2, 0.75, 0.2, 1);
    will-change: transform, opacity;
  }

  .hint-idle {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }

  .hint-hover {
    opacity: 0;
    transform: translate3d(0.25ch, 0.15em, 0) scale(0.94);
    /* text-transform: lowercase; */
  }

  .hover-morph-hint.is-morphed .hint-idle {
    opacity: 0;
    transform: translate3d(0, -0.16em, 0) scale(0.9);
  }

  .hover-morph-hint.is-morphed .hint-hover {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }

  .hover-morph-hint::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -0.14em;
    height: 1px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0;
    pointer-events: none;
  }

  .hover-morph-hint:not(.is-morphed) {
    animation: hover-hint-glow 2.8s ease-in-out infinite;
  }

  .hover-morph-hint:not(.is-morphed)::after {
    animation: hover-hint-underline 2.8s ease-in-out infinite;
  }

  @keyframes hover-hint-glow {
    0%,
    100% {
      text-shadow: 0 0 0 transparent;
    }
    50% {
      text-shadow: 0 0 0.32rem
        color-mix(in srgb, currentColor 72%, transparent 28%);
    }
  }

  @keyframes hover-hint-underline {
    0%,
    100% {
      opacity: 0;
      transform: scaleX(0.82);
    }
    50% {
      opacity: 0.36;
      transform: scaleX(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hover-morph-hint:not(.is-morphed) {
      animation: none;
    }

    .hover-morph-hint:not(.is-morphed)::after {
      animation: none;
    }
  }
</style>

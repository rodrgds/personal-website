<script lang="ts">
  export let forId: string = "";
</script>

<label for={forId} class="label-base">
  <slot />
</label>

<style>
  .label-base {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--heading-color);
    margin-bottom: 0.4rem;
  }
</style>

<script lang="ts">
  export let checked = false;
  export let id = "";
  export let label = "";
</script>

<div class="flex items-start">
  <div class="flex items-center h-5">
    <input
      {id}
      type="checkbox"
      bind:checked
      class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
      on:change
    />
  </div>
  <div class="ml-2 text-sm">
    <label
      for={id}
      class="font-medium text-gray-700 dark:text-gray-300 select-none cursor-pointer"
    >
      {label}
    </label>
    <slot name="description" />
  </div>
</div>

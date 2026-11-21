<script lang="ts">
  import Modal from "../../ui/Modal.svelte";
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  import WetrakrHistory from "./wetrakr-history.svelte";

  let isModalOpen = $state(false);

  function openModal() {
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>

<InteractiveLink text="movies-tv" onclick={openModal} />

<Modal
  bind:isOpen={isModalOpen}
  onClose={closeModal}
  title="wetrakr --history"
  size="lg"
  headerLink="https://url.rgo.pt/movies"
  headerLinkText="wetrakr"
>
  {#if isModalOpen}
    <WetrakrHistory />
  {/if}
</Modal>

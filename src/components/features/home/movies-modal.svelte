<script lang="ts">
  import Modal from "../../ui/Modal.svelte";
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  import TraktHistory from "./trakt-history.svelte";

  let isModalOpen = $state(false);

  function openModal() {
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>

<InteractiveLink text="Movies & Shows" onclick={openModal} />

<Modal
  bind:isOpen={isModalOpen}
  onClose={closeModal}
  title="My Movies & TV Shows"
  size="lg"
  headerLink="https://url.rgo.pt/movies"
  headerLinkText="View full profile"
>
  <TraktHistory />
</Modal>

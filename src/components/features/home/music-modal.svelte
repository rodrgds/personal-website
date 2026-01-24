<script lang="ts">
  import Modal from "../../ui/Modal.svelte";
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  import LastfmHistory from "./lastfm-history.svelte";

  let isModalOpen = $state(false);

  function openModal() {
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>

<InteractiveLink text="Music" onclick={openModal} />

<Modal
  bind:isOpen={isModalOpen}
  onClose={closeModal}
  title="My Music"
  size="lg"
  headerLink="https://url.rgo.pt/music"
  headerLinkText="View full profile"
>
  <LastfmHistory />
</Modal>

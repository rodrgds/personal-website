<script lang="ts">
  import Modal from "../../ui/Modal.svelte";
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  import PingPongGame from "./ping-pong-game.svelte";

  let isModalOpen = $state(false);

  function openModal() {
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>

<InteractiveLink text="Table Tennis" onclick={openModal} />

<Modal
  bind:isOpen={isModalOpen}
  onClose={closeModal}
  title="Ping Pong Game"
  size="md"
>
  <PingPongGame />
</Modal>

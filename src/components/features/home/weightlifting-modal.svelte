<script lang="ts">
  import Modal from "../../ui/Modal.svelte";
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  import HevyRoutines from "./hevy-routines.svelte";

  let isModalOpen = $state(false);

  function openModal() {
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>

<InteractiveLink text="Weightlifting" onclick={openModal} />

<Modal
  bind:isOpen={isModalOpen}
  onClose={closeModal}
  title="My Workouts & Routines"
  size="lg"
>
  <HevyRoutines />
</Modal>

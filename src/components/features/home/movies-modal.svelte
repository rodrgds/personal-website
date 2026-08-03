<script lang="ts">
  import Modal from "../../ui/Modal.svelte";
  import InteractiveLink from "../../ui/InteractiveLink.svelte";
  // import TraktHistory from "./trakt-history.svelte";

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
  headerLinkText="View WeTrakr profile"
>
  <div class="migration-notice">
    <p>
      I'm moving my movie and TV show tracking from Trakt.tv to
      <a
        href="https://url.rgo.pt/movies"
        target="_blank"
        rel="noopener noreferrer"
        >WeTrakr</a
      >.
    </p>
    <p>
      <strong>WeTrakr API v1.0 coming soon.</strong> As soon as it's released,
      I'll be building this integration.
    </p>
  </div>

  <!-- The previous history renderer stays available while the WeTrakr API is pending.
  <TraktHistory />
  -->
</Modal>

<style>
  .migration-notice {
    max-width: 38rem;
    margin: 1rem auto;
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--border-color);
    border-radius: 0.45rem;
    background: var(--bg-secondary);
  }

  .migration-notice p {
    margin: 0;
  }

  .migration-notice p + p {
    margin-top: 1rem;
  }
</style>

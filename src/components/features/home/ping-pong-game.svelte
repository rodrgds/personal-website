<script lang="ts">
  // Simple placeholder for a future ping pong game
  // You can replace this with an actual game implementation

  let score = $state({ player: 0, computer: 0 });

  function playGame() {
    // Placeholder game logic
    alert(
      "🏓 Game coming soon! This demonstrates how easy it is to add new interactive content.",
    );
  }
</script>

<div class="ping-pong-game">
  <div class="scoreboard">
    <div class="score">
      <span>You</span>
      <span class="points">{score.player}</span>
    </div>
    <div class="divider">:</div>
    <div class="score">
      <span>Computer</span>
      <span class="points">{score.computer}</span>
    </div>
  </div>

  <div class="game-area">
    <p>🏓 Ping Pong Game</p>
    <p class="coming-soon">Coming soon!</p>
    <p class="description">
      This is a placeholder to demonstrate the flexible modal system.
    </p>
  </div>

  <button class="play-button" onclick={playGame}> Start Game </button>
</div>

<style>
  .ping-pong-game {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    gap: 2rem;
  }

  .scoreboard {
    display: flex;
    align-items: center;
    gap: 2rem;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .score {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .points {
    font-size: 3rem;
    color: var(--link-color);
    font-weight: 700;
  }

  .divider {
    font-size: 2rem;
    opacity: 0.3;
  }

  .game-area {
    width: 100%;
    min-height: 300px;
    background: rgba(0, 0, 0, 0.02);
    border: 2px dashed var(--border-color, #e5e5e5);
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
  }

  .game-area p:first-child {
    font-size: 2rem;
    margin: 0;
  }

  .coming-soon {
    font-size: 1.25rem;
    color: var(--link-color);
    font-weight: 600;
    margin: 0;
  }

  .description {
    font-size: 0.95rem;
    opacity: 0.7;
    margin: 0;
    text-align: center;
    max-width: 400px;
  }

  .play-button {
    padding: 1rem 2rem;
    background: var(--link-color);
    color: white;
    border: none;
    border-radius: 0.75rem;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .play-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .play-button:active {
    transform: translateY(0);
  }

  @media (prefers-color-scheme: dark) {
    .game-area {
      background: rgba(255, 255, 255, 0.02);
      border-color: rgba(255, 255, 255, 0.1);
    }
  }
</style>

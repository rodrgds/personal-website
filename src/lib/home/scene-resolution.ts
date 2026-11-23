/** Bound fill rate on large/Retina displays, then reduce it on slow GPUs. */
export class SceneResolution {
  private scale = 1;
  private started = 0;
  private frames = 0;

  pixelRatio(width: number, height: number, deviceRatio: number): number {
    return (
      Math.min(
        deviceRatio || 1,
        1.5,
        Math.sqrt(1_500_000 / Math.max(1, width * height)),
      ) * this.scale
    );
  }

  /** Sample whole seconds, avoiding shader warm-up and background-tab gaps. */
  update(now: number, hidden: boolean): boolean {
    if (hidden || !this.started || now - this.started > 2000) {
      this.started = now;
      this.frames = 0;
      return false;
    }
    this.frames++;
    const elapsed = now - this.started;
    if (elapsed < 1000) return false;
    const fps = (this.frames * 1000) / elapsed;
    this.started = now;
    this.frames = 0;
    if (fps >= 45 || this.scale <= 0.5) return false;
    this.scale = Math.max(0.5, this.scale * 0.8);
    return true;
  }
}

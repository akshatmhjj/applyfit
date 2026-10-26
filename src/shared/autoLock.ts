// Calls onLock after timeoutMs with no activity. Each touch() restarts the countdown.
export class AutoLock {
  readonly #timeoutMs: number;
  readonly #onLock: () => void;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(timeoutMs: number, onLock: () => void) {
    this.#timeoutMs = timeoutMs;
    this.#onLock = onLock;
  }

  touch(): void {
    this.stop();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#onLock();
    }, this.#timeoutMs);
  }

  stop(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}

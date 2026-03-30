interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  requestTimeoutMs: number;
}

export type CircuitBreakerState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private halfOpenInFlight = false;
  private lastError: string | undefined;

  constructor(private readonly options: CircuitBreakerOptions) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.maybeMoveToHalfOpen();

    if (this.state === "open") {
      throw new Error(this.lastError ?? "Circuit breaker is open");
    }

    if (this.state === "half-open" && this.halfOpenInFlight) {
      throw new Error("Circuit breaker half-open probe already in progress");
    }

    if (this.state === "half-open") {
      this.halfOpenInFlight = true;
    }

    try {
      const result = await this.withTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (this.state !== "half-open") {
        this.halfOpenInFlight = false;
      }
    }
  }

  getSnapshot() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : null
    };
  }

  private maybeMoveToHalfOpen() {
    if (this.state !== "open" || this.openedAt === null) {
      return;
    }

    if (Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
      this.state = "half-open";
      this.halfOpenInFlight = false;
    }
  }

  private onSuccess() {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.lastError = undefined;
    this.halfOpenInFlight = false;
  }

  private onFailure(message: string) {
    this.lastError = message;

    if (this.state === "half-open") {
      this.trip();
      return;
    }

    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.trip();
    }
  }

  private trip() {
    this.state = "open";
    this.openedAt = Date.now();
    this.halfOpenInFlight = false;
  }

  private async withTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Circuit breaker timed out after ${this.options.requestTimeoutMs} ms`));
      }, this.options.requestTimeoutMs);

      void operation()
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
}

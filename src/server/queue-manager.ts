const getMaxConcurrentTests = (): number => {
  const envVal = process.env.MAX_CONCURRENT_TESTS;
  if (envVal && !isNaN(parseInt(envVal, 10)) && parseInt(envVal, 10) > 0) {
    return parseInt(envVal, 10);
  }
  return 3;
};

const getMaxConcurrentGenerations = (): number => {
  const envVal = process.env.MAX_CONCURRENT_GENERATIONS;
  if (envVal && !isNaN(parseInt(envVal, 10)) && parseInt(envVal, 10) > 0) {
    return parseInt(envVal, 10);
  }
  return 5;
};

/**
 * Maximum number of WAITING tasks allowed in a queue (0 = unbounded).
 * Caps memory/latency under a flood of runs; a full queue rejects new work
 * with a QueueFullError so the route can answer 503 instead of piling up.
 */
const getMaxQueueLength = (): number => {
  const envVal = process.env.MAX_QUEUE_LENGTH;
  if (envVal !== undefined) {
    const n = parseInt(envVal, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return 0; // unbounded by default (back-compat)
};

/** Error thrown by enqueue() when the queue is full (waiting tasks at capacity). */
export class QueueFullError extends Error {
  public readonly code = 'QUEUE_FULL';
  constructor(message = 'Server is busy: the execution queue is full. Please try again shortly.') {
    super(message);
    this.name = 'QueueFullError';
  }
}

/** Type guard: true when a caught value is a QueueFullError (survives module/instanceof edges). */
export function isQueueFullError(err: unknown): err is QueueFullError {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === 'QUEUE_FULL';
}

export class ConcurrencyQueueManager {
  private maxConcurrent: number;
  private maxQueue: number;
  private activeCount: number = 0;
  private queue: Array<{
    taskFn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];

  /**
   * @param maxConcurrent tasks allowed to run at once.
   * @param maxQueue max WAITING tasks before enqueue rejects (0 = unbounded).
   */
  constructor(maxConcurrent: number = 3, maxQueue: number = 0) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
  }

  public enqueue<T>(taskFn: () => Promise<T>): Promise<T> {
    // Backpressure: reject when the waiting queue is at capacity. A task that
    // could start running right now (a free concurrency slot) is always
    // accepted; only genuinely-waiting work counts against maxQueue.
    if (
      this.maxQueue > 0 &&
      this.activeCount >= this.maxConcurrent &&
      this.queue.length >= this.maxQueue
    ) {
      return Promise.reject(new QueueFullError());
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        taskFn: taskFn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject: reject as (reason: unknown) => void
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;

    try {
      const result = await item.taskFn();
      item.resolve(result);
    } catch (err: unknown) {
      item.reject(err);
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  /**
   * True when a new task would be rejected right now (all slots busy AND the
   * waiting queue is at capacity). Lets a caller bail out before doing side
   * effects (e.g. creating a history record) that enqueue would strand.
   */
  public isFull(): boolean {
    return (
      this.maxQueue > 0 &&
      this.activeCount >= this.maxConcurrent &&
      this.queue.length >= this.maxQueue
    );
  }

  public getStats(): { activeCount: number; queuedCount: number; maxConcurrent: number; maxQueue: number } {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue
    };
  }
}

/** Queue for executing Playwright test runs */
export const globalTestRunnerQueue = new ConcurrencyQueueManager(getMaxConcurrentTests(), getMaxQueueLength());

/** Queue for executing crawler-based test script generations */
export const globalTestGeneratorQueue = new ConcurrencyQueueManager(getMaxConcurrentGenerations(), getMaxQueueLength());

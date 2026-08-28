const MAX_CONCURRENT_RUNS = 3;

export class ConcurrencyQueueManager {
  private maxConcurrent: number;
  private activeCount: number = 0;
  private queue: Array<{
    taskFn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];

  constructor(maxConcurrent: number = MAX_CONCURRENT_RUNS) {
    this.maxConcurrent = maxConcurrent;
  }

  public enqueue<T>(taskFn: () => Promise<T>): Promise<T> {
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
    } catch (err) {
      item.reject(err);
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  public getStats(): { activeCount: number; queuedCount: number; maxConcurrent: number } {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

export const globalTestRunnerQueue = new ConcurrencyQueueManager(3);

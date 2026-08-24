export class ConcurrencyQueueManager {
  private maxConcurrent: number;
  private activeCount: number = 0;
  private queue: Array<{
    taskFn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  public enqueue<T>(taskFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
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

  public getStats() {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

export const globalTestRunnerQueue = new ConcurrencyQueueManager(3);

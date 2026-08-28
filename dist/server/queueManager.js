"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalTestRunnerQueue = exports.ConcurrencyQueueManager = void 0;
class ConcurrencyQueueManager {
    maxConcurrent;
    activeCount = 0;
    queue = [];
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
    }
    enqueue(taskFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ taskFn, resolve, reject });
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }
        const item = this.queue.shift();
        if (!item)
            return;
        this.activeCount++;
        try {
            const result = await item.taskFn();
            item.resolve(result);
        }
        catch (err) {
            item.reject(err);
        }
        finally {
            this.activeCount--;
            this.processQueue();
        }
    }
    getStats() {
        return {
            activeCount: this.activeCount,
            queuedCount: this.queue.length,
            maxConcurrent: this.maxConcurrent
        };
    }
}
exports.ConcurrencyQueueManager = ConcurrencyQueueManager;
exports.globalTestRunnerQueue = new ConcurrencyQueueManager(3);

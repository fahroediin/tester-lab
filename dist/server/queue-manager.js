"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalTestGeneratorQueue = exports.globalTestRunnerQueue = exports.ConcurrencyQueueManager = void 0;
const getMaxConcurrentTests = () => {
    const envVal = process.env.MAX_CONCURRENT_TESTS;
    if (envVal && !isNaN(parseInt(envVal, 10)) && parseInt(envVal, 10) > 0) {
        return parseInt(envVal, 10);
    }
    return 3;
};
const getMaxConcurrentGenerations = () => {
    const envVal = process.env.MAX_CONCURRENT_GENERATIONS;
    if (envVal && !isNaN(parseInt(envVal, 10)) && parseInt(envVal, 10) > 0) {
        return parseInt(envVal, 10);
    }
    return 5;
};
class ConcurrencyQueueManager {
    maxConcurrent;
    activeCount = 0;
    queue = [];
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
    }
    enqueue(taskFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                taskFn: taskFn,
                resolve: resolve,
                reject: reject
            });
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
/** Queue for executing Playwright test runs */
exports.globalTestRunnerQueue = new ConcurrencyQueueManager(getMaxConcurrentTests());
/** Queue for executing crawler-based test script generations */
exports.globalTestGeneratorQueue = new ConcurrencyQueueManager(getMaxConcurrentGenerations());

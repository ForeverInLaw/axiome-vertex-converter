/**
 * Global conversion queue to prevent CPU overload
 * Ensures bot remains responsive to all users
 */

class ConversionQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process(); // Process next task
    }
  }

  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Global queue instance - configurable concurrent conversions
const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CONVERSIONS || '2', 10);
console.log(`Conversion queue: max ${maxConcurrent} concurrent conversions`);
const conversionQueue = new ConversionQueue(maxConcurrent);

module.exports = { conversionQueue };

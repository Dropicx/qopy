/**
 * Simple concurrency limiter using native JavaScript.
 * Replaces p-limit (ESM-only) with a CommonJS-compatible implementation.
 * @param {number} limit - Maximum concurrent operations
 * @returns {function} - Limited function executor: call run(fn) to execute fn with concurrency control
 */
function createLimiter(limit) {
    let running = 0;
    const queue = [];

    const run = async (fn) => {
        return new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
            process();
        });
    };

    const process = async () => {
        if (running >= limit || queue.length === 0) return;

        running++;
        const { fn, resolve, reject } = queue.shift();

        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            running--;
            process();
        }
    };

    return run;
}

module.exports = { createLimiter };

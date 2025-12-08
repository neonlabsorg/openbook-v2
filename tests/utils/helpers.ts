export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomName(): string {
    const length = Math.floor(Math.random() * 2) + 3;
    return Math.random().toString(36).toUpperCase().replace(/[0-9O]/g, '').substring(1, length + 1);
}

export var log = require('tracer').console({
    format: '{{timestamp}} [{{title}}]:: {{message}}',
    dateformat: 'HH:MM:ss.L'
});

export async function retry<T extends (...arg0: any[]) => any>(
    fn: T,
    args: Parameters<T>,
    maxRetry: number,
    label: string,
    retryCount = 1,
): Promise<Awaited<ReturnType<T>>> {
    const current = typeof retryCount === "number" ? retryCount : 1;
    try {
        const result = await fn(...args);
        return result;
    } catch (error) {
        log.warn(`Retry ${current} ${label}`);
        if (current > maxRetry) {
            log.error(`${maxRetry} retry attempts reached`);
            throw error;
        }
        sleep(500);
        return retry(fn, args, maxRetry, label, current + 1);
    }
}
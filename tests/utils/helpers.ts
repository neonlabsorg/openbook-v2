export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomName(): string {
    const length = Math.floor(Math.random() * 2) + 3;
    return Math.random().toString(36).toUpperCase().replace(/[0-9O]/g, '').substring(1, length + 1);
}

import tracer from 'tracer';

export const log = tracer.console({
    format: '{{timestamp}} [{{title}}]:: {{message}}',
    dateformat: 'HH:MM:ss.L'
});

export async function retry<T extends (...args: any[]) => any>(
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
        await sleep(500);
        return retry(fn, args, maxRetry, label, current + 1);
    }
}

export async function runWithConcurrencyLimit<T>(
    tasks: Array<() => Promise<T>>,
    limit: number
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let index = 0;

    async function worker() {
        while (true) {
            const current = index++;
            if (current >= tasks.length) break;
            results[current] = await tasks[current]();
        }
    }

    const workers: Promise<void>[] = [];
    const workerCount = Math.min(limit, tasks.length);
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}

import { connection } from "./solanaClient"
import type { Commitment } from "@solana/web3.js";

export async function waitForSuccessfulTxs(signatures: string[], commitment: Commitment, label: string): Promise<void> {
    const SIGNATURE_STATUS_CHUNK = 256;
    const POLL_INTERVAL_MS = 500;

    const pendingSignatures = new Set(signatures);

    while (pendingSignatures.size > 0) {
        const sigArray = Array.from(pendingSignatures);

        for (let i = 0; i < sigArray.length; i += SIGNATURE_STATUS_CHUNK) {
            const chunk = sigArray.slice(i, i + SIGNATURE_STATUS_CHUNK);
            const statusResponse = await connection.getSignatureStatuses(chunk);
            const statuses = statusResponse.value;

            for (let j = 0; j < statuses.length; j++) {
                const status = statuses[j];
                const signature = chunk[j];

                if (!status) {
                    continue;
                }

                if (status.err) {
                    log.error(
                        "%s transaction failed. Signature: %s, status: %s",
                        label,
                        signature,
                        JSON.stringify(status)
                    );
                }

                if (status.confirmationStatus === commitment) {
                    pendingSignatures.delete(signature);
                }
            }
        }

        if (pendingSignatures.size > 0) {
            await sleep(POLL_INTERVAL_MS);
        }
    }
}
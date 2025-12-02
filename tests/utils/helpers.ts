import * as nacl from "tweetnacl";

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomName(): string {
    const length = Math.floor(Math.random() * 2) + 3;
    return Math.random().toString(36).toUpperCase().replace(/[0-9O]/g, '').substring(1, length + 1);
}

export var log = require('tracer').colorConsole({
    format: '{{timestamp}} [{{title}}]:: {{message}}',
    dateformat: 'HH:MM:ss.L'
});

export async function sendTxWithRetry(connection, transaction, payer): Promise<string> {
    const blockhashResponse = await connection.getLatestBlockhash();
    const lastValidBlockHeight = blockhashResponse.lastValidBlockHeight - 150;

    transaction.recentBlockhash = blockhashResponse.blockhash;
    transaction.feePayer = payer.publicKey;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    const message = transaction.serializeMessage();
    const signature = nacl.sign.detached(message, payer.secretKey);
    transaction.addSignature(payer.publicKey, Buffer.from(signature));

    const rawTransaction = transaction.serialize();

    let blockheight = await connection.getBlockHeight();
    let i = 0;
    let txSignature;

    while (blockheight < lastValidBlockHeight) {
        log.info("Try to send trx %s", i);
        txSignature = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: true
        });
        await sleep(500);
        blockheight = await connection.getBlockHeight();
        i + 1;
    }
    return txSignature;
}
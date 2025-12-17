import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress, createMint } from "@solana/spl-token";
import { getRandomName } from "./helpers";
import config from '../config';
import { log, retry } from "./helpers";
import tradingConfig from '../tradingConfig';

export const connection = new Connection(config.RPC, 'confirmed');

export class SolanaClient {
    async createAccountWithBalance(balance = tradingConfig.consts.initialAccountBalance): Promise<Keypair> {
        const kp = Keypair.generate();
        await this.fundAccount(kp.publicKey, Math.round(balance));
        return kp;
    };

    async fundAccount(accountPublicKey, balance) {
        const signature = await connection.requestAirdrop(accountPublicKey, balance * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(signature);
    }

    async getBalance(accountPublicKey) {
        return await connection.getBalance(accountPublicKey);
    }

    async deploySPLToken(payers: Keypair[], decimals: number): Promise<PublicKey> {
        const mint = await createMint(
            connection,
            payers[0],           // Payer of the transaction
            payers[0].publicKey, // Mint authority
            payers[0].publicKey, // Freeze authority (optional, can be null)
            decimals             // Decimals
        );

        let transaction = new Transaction();
        for (let i = 0; i < payers.length; i++) {
            let keypairAta = await getAssociatedTokenAddress(
                mint,
                payers[i].publicKey,
                false
            );

            transaction.add(
                createAssociatedTokenAccountInstruction(
                    payers[0].publicKey,
                    keypairAta,
                    payers[i].publicKey,
                    mint
                )
            );

            transaction.add(
                createMintToInstruction(
                    mint,
                    keypairAta,
                    payers[0].publicKey,
                    tradingConfig.consts.initialMintAmount * 10 ** decimals
                )
            );

            if ((i + 1) % 10 == 0) {
                const signature = await retry(sendAndConfirmTransaction, [connection, transaction, [payers[0]]], 5, "deploySPLToken");
                log.info('SIGNATURE token %s deploying: %s', mint.toBase58(), signature);
                transaction = new Transaction();
            }
        }
        if (transaction.instructions.length != 0) {
            const signature = await retry(sendAndConfirmTransaction, [connection, transaction, [payers[0]]], 5, "deploySPLToken");
            log.info('SIGNATURE token %s deploying: %s', mint.toBase58(), signature);
        }
        return mint;
    };

    async createToken(type: string, payers: Keypair[], decimals: number): Promise<Object> {
        const name = getRandomName();
        const mint = await this.deploySPLToken(payers, decimals);
        log.info("%s token %s with mint %s created", type, name, mint.toBase58());
        return { "name": name, "mint": mint };
    }
}

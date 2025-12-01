import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress, createMint } from "@solana/spl-token";
import { getRandomName } from "./helpers";
import config from '../config';
import "dotenv/config";
import { log } from "./helpers";

export const connection = new Connection(config.RPC, 'confirmed');

export class SolanaClient {
    async createAccountWithBalance(balance = 10): Promise<Keypair> {
        const kp = Keypair.generate();
        await this.fundAccount(kp.publicKey, balance);
        return kp;
    };

    async fundAccount(accountPublicKey, balance) {
        const signature = await connection.requestAirdrop(accountPublicKey, balance * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(signature);
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
                    10000 * 10 ** decimals
                )
            );

            if ((i + 1) % 10 == 0) {
                const signature = await sendAndConfirmTransaction(
                    connection,
                    transaction,
                    [payers[0]]
                );
                log.info('SIGNATURE token %s deploying: %s', mint.toBase58(), signature);
                transaction = new Transaction();
            }
        }

        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [payers[0]]
        );
        log.info('SIGNATURE token %s deploying: %s', mint.toBase58(), signature);

        return mint;
    };

    async createToken(payers: Keypair[], decimals: number): Promise<Object> {
        const name = getRandomName();
        const mint = await this.deploySPLToken(payers, decimals);
        log.info("Quote token %s with mint %s created", name, mint.toBase58());
        return { "name": name, "mint": mint };
    }
}

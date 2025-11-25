import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress, createMint } from "@solana/spl-token";
import config from '../config';
import "dotenv/config"

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
                    1000 * 10 ** decimals
                )
            );
        }

        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [payers[0]]
        );
        console.log('\nSIGNATURE token deploying:', signature);

        return mint;
    };

    async createToken(payers: Keypair[], decimals: number): Promise<Object> {
        const mint = await this.deploySPLToken(payers, decimals);
        const name = Math.random().toString(36).toUpperCase().replace(/[0-9O]/g, '').substring(1, 5);
        return { "name": name, "mint": mint }
    }
}

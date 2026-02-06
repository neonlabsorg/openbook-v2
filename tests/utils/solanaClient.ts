import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
    Commitment,
    ConnectionConfig
} from '@solana/web3.js';

import {
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    getAssociatedTokenAddress,
    createMint
} from "@solana/spl-token";

import { getRandomName } from "./helpers";
import config from '../config';
import { log, retry } from "./helpers";
import tradingConfig from '../tradingConfig';
import { AnchorProvider } from '@coral-xyz/anchor';
import { IMarket, Balances } from "./interfaces";
import { MintUtils } from "../utils/mintUtils";
import http from "http";
import https from "https";

const commitment: Commitment = "confirmed";

const httpAgent =
    config.RPC.startsWith("https://")
        ? new https.Agent({ keepAlive: true })
        : new http.Agent({ keepAlive: true });

const connectionConfig: ConnectionConfig = {
    commitment,
    httpAgent,
};

export const connection = new Connection(config.RPC, connectionConfig);

export class SolanaClient {
    async createAccountWithBalance(balance: number = tradingConfig.consts.initialAccountBalance): Promise<Keypair> {
        const kp = Keypair.generate();
        await this.fundAccount(kp.publicKey, Math.round(balance));
        return kp;
    };

    async fundAccount(account: PublicKey, balance: number) {
        try {
            const signature = await connection.requestAirdrop(account, balance * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(signature);
        } catch (error) {
            log.error("Error on funding account %s: ", account.toBase58(), error);
            process.exit(1);
        }
    }

    async getBalance(account: PublicKey) {
        return await connection.getBalance(account);
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

    async createToken(type: string, payers: Keypair[], decimals: number): Promise<{ name: string; mint: PublicKey }> {
        const name = getRandomName();
        const mint = await this.deploySPLToken(payers, decimals);
        log.info("%s token %s with mint %s created", type, name, mint.toBase58());
        return { name, mint };
    }

    async getPairBalances(provider: AnchorProvider, market: IMarket, account: Keypair): Promise<Balances> {
        const mintUtils = new MintUtils(provider.connection, account);
        const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
            market.quoteMint,
            account,
            account.publicKey
        );

        const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
            market.baseMint,
            account,
            account.publicKey
        );

        return { account: account.publicKey, marketName: market.name, quote: userQuoteAcc.amount, base: userBaseAcc.amount }
    }
}

import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import fs from 'fs';
import config from './config';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";

// Setup connection
const connection = new Connection(config.RPC, 'confirmed');

// Load wallet
const keypairFile = fs.readFileSync(
    `${process.env.HOME}/.config/solana/id.json`,
    'utf-8'
);
const walletKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile)));
const wallet = new Wallet(walletKeypair);

const programId = new PublicKey(config.accounts.programId);
const client = new OpenBookV2Client(new AnchorProvider(connection, wallet, {commitment: 'confirmed'}), programId);
const baseMint = new PublicKey(config.accounts.baseMint);
const quoteMint = new PublicKey(config.accounts.quoteMint);

async function createMarket() {
    const name = "SOL-USDC";
    const [ixs, signers] = await client.createMarketIx(
        wallet.publicKey,
        name,
        quoteMint,
        baseMint,
        new anchor.BN(1),
        new anchor.BN(1000000),
        new anchor.BN(1000),
        new anchor.BN(1000),
        new anchor.BN(0),
        null,
        null,
        null,
        null,
        null
    );
    console.log(ixs, 'ixs');

    const tx = await client.sendAndConfirmTransaction(ixs, {
        additionalSigners: signers,
    });

    console.log("created market", tx);
}
createMarket();
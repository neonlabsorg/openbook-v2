import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';
import config from './config';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { TOKEN_PROGRAM_ID, MINT_SIZE, createInitializeMint2Instruction, createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress, createMint } from "@solana/spl-token";

const connection = new Connection(config.RPC, 'confirmed');

const keypairFile = fs.readFileSync(
    `${process.env.HOME}/.config/solana/id.json`,
    'utf-8'
);
const walletKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile)));
const wallet = new Wallet(walletKeypair);

const programId = new PublicKey(config.accounts.programId);
const client = new OpenBookV2Client(new AnchorProvider(connection, wallet, {commitment: 'confirmed'}), programId);

async function createMarket() {
    /// Deploying base and quote SPL tokens for the market
    const quoteMint = await deploySPLToken(walletKeypair, 6);
    const baseMint = await deploySPLToken(walletKeypair, 9);

    const name = "pSOL-TEST";
    const [ixs, signers] = await client.createMarketIx(
        wallet.publicKey,
        name,
        quoteMint,
        baseMint,
        new anchor.BN(10000),   /// Minimum price increment: 0.01 USDC per lot
        new anchor.BN(1000000), /// Minimum order size: 0.001 pSOL
        new anchor.BN(1000),
        new anchor.BN(1000),
        new anchor.BN(0),
        null,
        null,
        null,
        null,
        null
    );

    const tx = await client.sendAndConfirmTransaction(ixs, {
        additionalSigners: signers,
    });

    console.log("\nSIGNATURE market creation:", tx);
    console.log("Deployed market", name, "at:", ixs[ixs.length - 1].keys[0].pubkey.toBase58());
}
createMarket();

async function deploySPLToken(payer: Keypair, decimals: number) : Promise<PublicKey> {
    const mint = await createMint(
        connection,
        payer,           // Payer of the transaction
        payer.publicKey, // Mint authority
        payer.publicKey, // Freeze authority (optional, can be null)
        decimals         // Decimals
    );

    const keypairAta = await getAssociatedTokenAddress(
        mint,
        payer.publicKey,
        false
    );

    let transaction = new Transaction();
    transaction.add(
        createAssociatedTokenAccountInstruction(
            payer.publicKey,
            keypairAta,
            payer.publicKey,
            mint
        )
    );

    transaction.add(
        createMintToInstruction(
            mint,
            keypairAta,
            payer.publicKey,
            1000 * 10 ** decimals
        )
    );

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer]
    );
    console.log('\nSIGNATURE token deploying:', signature);
    console.log("Deployed SPL Token:", mint);

    return mint;
}
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import config from './config';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress, createMint } from "@solana/spl-token";
import bs58 from 'bs58';
import "dotenv/config"

const connection = new Connection(config.RPC, 'confirmed');

const makerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.MAKER_PK as string)
);
const makerWallet = new Wallet(makerKeypair);

const takerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.TAKER_PK as string)
);

const programId = new PublicKey(config.accounts.programId);
const client = new OpenBookV2Client(new AnchorProvider(connection, makerWallet, {commitment: 'confirmed'}), programId);

async function createMarket() {
    /// Deploying base and quote SPL tokens for the market
    const quoteMint = await deploySPLToken([makerKeypair, takerKeypair], 9);
    const baseMint = await deploySPLToken([makerKeypair, takerKeypair], 9);

    const name = "pSOL-TEST";
    const [ixs, signers] = await client.createMarketIx(
        makerWallet.publicKey,
        name,
        quoteMint,
        baseMint,
        new BN(1000000),   /// Minimum price increment: 0.01 TEST per lot
        new BN(1000000), /// Minimum order size: 0.001 pSOL
        new BN(1000),
        new BN(1000),
        new BN(0),
        null,
        null,
        null,
        makerWallet.publicKey,
        makerWallet.publicKey
    );

    const tx = await client.sendAndConfirmTransaction(ixs, {
        additionalSigners: signers,
    });

    console.log("\nSIGNATURE market creation:", tx);
    console.log("\nDeployed market", name, "at:", ixs[ixs.length - 1].keys[0].pubkey.toBase58());
    console.log("Quote mint:", quoteMint.toBase58());
    console.log("Base mint:", baseMint.toBase58());
}
createMarket();

async function deploySPLToken(payers: Keypair[], decimals: number) : Promise<PublicKey> {
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
}
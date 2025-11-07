import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import fs from 'fs';
import config from './config';
import {
    OpenBookV2Client
} from "@openbook-dex/openbook-v2";

// Setup connection
const connection = new Connection(config.RPC, 'confirmed');

// Load wallet
const keypairFile = fs.readFileSync(
    `${process.env.HOME}/.config/solana/id.json`,
    'utf-8'
);
const walletKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile)));
const wallet = new Wallet(walletKeypair);

const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
});
const client = new OpenBookV2Client(provider, new PublicKey(config.accounts.programId));
  
async function createOpenOrders() {
    const market = new PublicKey(config.accounts.market);
    const tx = await client.createOpenOrders(wallet.payer, market, "name");
    console.log("created open orders acc", tx);
}
createOpenOrders();
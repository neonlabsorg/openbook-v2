import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import config from '../config';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import bs58 from 'bs58';
import "dotenv/config";

const connection = new Connection(config.RPC, 'confirmed');

const makerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.MAKER_PK as string)
);
const makerWallet = new Wallet(makerKeypair);

const provider = new AnchorProvider(connection, makerWallet, {commitment: "confirmed"});
const client = new OpenBookV2Client(provider, new PublicKey(config.accounts.programId));
  
async function init() {
    const marketPublicKey = new PublicKey(config.accounts.market);
    const openorders = await client.findOpenOrdersForMarket(makerWallet.publicKey, marketPublicKey);

    for (const openOrderPubkey of openorders) {
        const openOrder = await client.deserializeOpenOrderAccount(openOrderPubkey);
        if (openOrder) {
            if (openOrder.version != 1) {
                throw "using an old open orders account, please close it"
            }
            
            console.log("bidsQuoteLots", openOrder.position.bidsQuoteLots.toNumber());
            console.log("asksBaseLots", openOrder.position.asksBaseLots.toNumber());
        }
    }
}
init();
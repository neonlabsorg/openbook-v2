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
    const openOrdersAccount = await client.program.account.openOrdersAccount.fetch(new PublicKey(config.accounts.openOrders));

    // Filter only open orders (isFree === 0)
    const filteredOpenOrders = openOrdersAccount.openOrders.filter(function (el) {
        return el.isFree === 0;
    });

    console.log(filteredOpenOrders, 'filteredOpenOrders');
}
init();
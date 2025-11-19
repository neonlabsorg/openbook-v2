import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import config from './config';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import bs58 from 'bs58';
import "dotenv/config"

const connection = new Connection(config.RPC, 'confirmed');

const makerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.MAKER_PK as string)
);
const makerWallet = new Wallet(makerKeypair);

const provider = new AnchorProvider(connection, makerWallet, {commitment: "confirmed"});
const client = new OpenBookV2Client(provider, new PublicKey(config.accounts.programId));
  
async function cancelOrderById() {
    const marketPublicKey = new PublicKey(config.accounts.market);
    const market = await client.program.account.market.fetch(marketPublicKey);
    const openOrdersAccount = await client.program.account.openOrdersAccount.fetch(new PublicKey(config.accounts.openOrders));

    const [ix, signers] = await client.cancelOrderByIdIx(
        new PublicKey(config.accounts.openOrders),
        openOrdersAccount,
        market,
        openOrdersAccount.openOrders[0].id /// ID of the order to cancel, in this case it will always cancel the first order in the list
    );
    
    const cancelTx = await client.sendAndConfirmTransaction([ix], signers);
    console.log("Cancelled order ", cancelTx);
}
cancelOrderById();
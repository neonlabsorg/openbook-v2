import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import config from './config';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { MintUtils } from "./utils/mint_utils";
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
    const mintUtils = new MintUtils(provider.connection, makerKeypair);

    const marketPublicKey = new PublicKey(config.accounts.market);
    const market = await client.program.account.market.fetch(marketPublicKey);
    const openOrdersAccount = await client.program.account.openOrdersAccount.fetch(new PublicKey(config.accounts.openOrders));

    const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    );

    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    );

    const depositIx = await client.depositIx(
        new PublicKey(config.accounts.openOrders),
        openOrdersAccount,
        market,
        userBaseAcc.address,
        userQuoteAcc.address,
        new BN(1000),
        new BN(1000)
    );
    
    const cancelTx = await client.sendAndConfirmTransaction([depositIx], [makerKeypair]);
    console.log("deposit to ordersAccount signature", cancelTx);
}
init();
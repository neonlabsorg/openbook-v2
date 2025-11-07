import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import fs from 'fs';
import config from './config';
import {
    OpenBookV2Client,
    PlaceOrderArgs,
    SideUtils,
    PlaceOrderTypeUtils,
    SelfTradeBehaviorUtils,
    uiBaseToLots,
    uiPriceToLots,
    uiQuoteToLots,
} from "@openbook-dex/openbook-v2";
import { MintUtils } from "./utils/mint_utils";

const connection = new Connection(config.RPC, 'confirmed');

const keypairFile = fs.readFileSync(
    `${process.env.HOME}/.config/solana/id.json`,
    'utf-8'
);
const walletKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile)));
const wallet = new Wallet(walletKeypair);

const provider = new AnchorProvider(connection, wallet, {commitment: "confirmed"});
const client = new OpenBookV2Client(provider, new PublicKey(config.accounts.programId));
  
async function placeOrder() {
    const marketPublicKey = new PublicKey(config.accounts.market);
    const market = await client.program.account.market.fetch(marketPublicKey);

    const mintUtils = new MintUtils(provider.connection, walletKeypair);
    const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        walletKeypair,
        client.walletPk
    );
    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        walletKeypair,
        client.walletPk
    );
    mintUtils.mintTo(market.quoteMint, userQuoteAcc.address);
    mintUtils.mintTo(market.baseMint, userBaseAcc.address);

    const args: PlaceOrderArgs = {
        side: SideUtils.Bid,  // BUYING base token
        priceLots: uiPriceToLots(market, 30),  // Willing to pay up to $30
        maxBaseLots: uiBaseToLots(market, 10),  // Buying 10 base tokens
        maxQuoteLotsIncludingFees: uiQuoteToLots(market, 350),  // Max $350 spend
        clientOrderId: new anchor.BN(Date.now()),
        orderType: PlaceOrderTypeUtils.ImmediateOrCancel,  // Execute immediately
        expiryTimestamp: new anchor.BN(0),
        selfTradeBehavior: SelfTradeBehaviorUtils.DecrementTake,
        limit: 255
    };

    let remainings = new Array<PublicKey>();
    const [ix, signers] = await client.placeTakeOrderIx(
        marketPublicKey,
        market,
        userBaseAcc.address,
        userQuoteAcc.address,
        null,
        args,
        remainings
    );

    const tx = await client.sendAndConfirmTransaction([ix], signers);
    console.log("Take order ", tx);
}
placeOrder();
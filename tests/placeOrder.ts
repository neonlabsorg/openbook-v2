import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import fs from 'fs';
import config from './config';
import {
    OpenBookV2Client,
    PlaceOrderArgs,
    SideUtils,
    uiBaseToLots,
    uiPriceToLots,
    uiQuoteToLots,
    PlaceOrderTypeUtils,
    SelfTradeBehaviorUtils
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
    await mintUtils.mintTo(market.quoteMint, userQuoteAcc.address);
    await mintUtils.mintTo(market.baseMint, userBaseAcc.address);

    const args: PlaceOrderArgs = {
        side: SideUtils.Ask,  // SELLING base token
        priceLots: uiPriceToLots(market, 25),  // Selling at $25
        maxBaseLots: uiBaseToLots(market, 10),  // Selling 10 base tokens
        maxQuoteLotsIncludingFees: uiQuoteToLots(market, 300),  // Will receive ~$250
        clientOrderId: new anchor.BN(Date.now()),
        orderType: PlaceOrderTypeUtils.Limit,  // Limit order - will rest on book
        expiryTimestamp: new anchor.BN(0),
        selfTradeBehavior: SelfTradeBehaviorUtils.DecrementTake,
        limit: 255
    };

    const [ix, signers] = await client.placeOrderIx(
        new PublicKey(config.accounts.openOrders),
        marketPublicKey,
        market,
        userBaseAcc.address,
        args,
        []
    );
    
    const tx = await client.sendAndConfirmTransaction([ix], signers);
    console.log("Placed order ", tx);
}
placeOrder();
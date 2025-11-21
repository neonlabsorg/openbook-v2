import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
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
import bs58 from 'bs58';
import "dotenv/config";

const connection = new Connection(config.RPC, 'confirmed');

const makerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.MAKER_PK as string)
);
const makerWallet = new Wallet(makerKeypair);

const provider = new AnchorProvider(connection, makerWallet, {commitment: "confirmed"});
const client = new OpenBookV2Client(provider, new PublicKey(config.accounts.programId));
  
async function placeOrder() {
    const marketPublicKey = new PublicKey(config.accounts.market);
    const market = await client.program.account.market.fetch(marketPublicKey);

    const mintUtils = new MintUtils(provider.connection, makerKeypair);
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

    console.log(userQuoteAcc.amount.toString(), 'MAKER quote balance before');
    console.log(userBaseAcc.amount.toString(), 'MAKER base balance before\n');

    const args: PlaceOrderArgs = {
        side: SideUtils.Ask,  // SELLING base token
        priceLots: uiPriceToLots(market, 25),  // Selling at $25
        maxBaseLots: uiBaseToLots(market, 10),  // Selling 10 base tokens
        maxQuoteLotsIncludingFees: uiQuoteToLots(market, 300),  // Will receive ~$250
        clientOrderId: new BN(Date.now()),
        orderType: PlaceOrderTypeUtils.Limit,  // Limit order - will rest on book
        expiryTimestamp: new BN(0),
        selfTradeBehavior: SelfTradeBehaviorUtils.DecrementTake,
        limit: 255  // How many matching orders from the opposite side to walk through
    };

    const [ix, signers] = await client.placeOrderIx(
        new PublicKey(config.accounts.openOrders),
        marketPublicKey,
        market,
        userBaseAcc.address,
        args,
        []
    );
    
    const tx = await client.sendAndConfirmTransaction([ix], { additionalSigners: signers });
    console.log("Placed order ", tx, '\n');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER quote balance after');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER base balance after');
}
placeOrder();
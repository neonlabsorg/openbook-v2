import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
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
import bs58 from 'bs58';
import "dotenv/config";

const connection = new Connection(config.RPC, 'confirmed');

const makerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.MAKER_PK as string)
);

const takerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.TAKER_PK as string)
);

const takerWallet = new Wallet(takerKeypair);


const provider = new AnchorProvider(connection, takerWallet, {commitment: "confirmed"});
const client = new OpenBookV2Client(provider, new PublicKey(config.accounts.programId));

async function placeOrder() {
    const marketPublicKey = new PublicKey(config.accounts.market);
    const market = await client.program.account.market.fetch(marketPublicKey);

    const mintUtils = new MintUtils(provider.connection, takerKeypair);
    const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        takerKeypair,
        takerKeypair.publicKey
    );
    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        takerKeypair,
        takerKeypair.publicKey
    );

    console.log(userQuoteAcc.amount.toString(), 'TAKER quote balance before');
    console.log(userBaseAcc.amount.toString(), 'TAKER base balance before\n');
    
    const args: PlaceOrderArgs = {
        side: SideUtils.Bid,  // BUYING base token
        priceLots: uiPriceToLots(market, 30),  // Willing to pay up to $30
        maxBaseLots: uiBaseToLots(market, 10),  // Buying 10 base tokens
        maxQuoteLotsIncludingFees: uiQuoteToLots(market, 350),  // Max $350 spend
        clientOrderId: new BN(Date.now()),
        orderType: PlaceOrderTypeUtils.Market,
        expiryTimestamp: new BN(0),
        selfTradeBehavior: SelfTradeBehaviorUtils.DecrementTake,
        limit: 255  // How many matching orders from the opposite side to walk through
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
    console.log("Take order ", tx, '\n');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        takerKeypair,
        takerKeypair.publicKey
    )).amount.toString(), 'TAKER quote balance after');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        takerKeypair,
        takerKeypair.publicKey
    )).amount.toString(), 'TAKER base balance after \n');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER quote balance after');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER base balance after \n');
}
placeOrder();
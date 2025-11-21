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
    const marketPublicKey = new PublicKey(config.accounts.market);
    const market = await client.program.account.market.fetch(marketPublicKey);

    let openOrdersData = await client.program.account.openOrdersAccount.fetch(new PublicKey(config.accounts.openOrders));
    console.log('\nMaker\'s OpenOrders balances before consumeEventsIx:');
    console.log('- Quote free:', openOrdersData.position.quoteFreeNative.toString());
    console.log('- Base free:', openOrdersData.position.baseFreeNative.toString());

    const consumeEventsIx = await client.consumeEventsIx(
        marketPublicKey,
        market,
        new BN(10), // Limit - process up to 10 events
        [new PublicKey(config.accounts.openOrders)]
    );

    const consumeTx = await client.sendAndConfirmTransaction([consumeEventsIx], {});
    console.log("\nconsumeEventsIx ", consumeTx, "\n");
   
    openOrdersData = await client.program.account.openOrdersAccount.fetch(new PublicKey(config.accounts.openOrders));
    console.log('Maker\'s OpenOrders balances after consumeEventsIx:');
    console.log('- Quote free:', openOrdersData.position.quoteFreeNative.toString());
    console.log('- Base free:', openOrdersData.position.baseFreeNative.toString(), '\n');

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
    console.log(userBaseAcc.amount.toString(), 'MAKER base balance before');

    const [ix, signers] = await client.settleFundsIx(
        new PublicKey(config.accounts.openOrders),
        openOrdersData,
        marketPublicKey,
        market,
        userBaseAcc.address,
        userQuoteAcc.address,
        null,
        makerWallet.publicKey
    );
    
    const tx = await client.sendAndConfirmTransaction([ix],{ additionalSigners: signers });
    console.log("\nsettleFunds ", tx, "\n");

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
init();
import { SolanaClient, connection } from "./utils/solanaClient"
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import config from './config';
import { createMarket, createOpenOrders, placeOrder, placeTakeOrder, settleFunds, getMarketTotalAmount, getUserOpenOrders } from "./trading/actions"
import "dotenv/config"

const solanaClient = new SolanaClient();
const programId = new PublicKey(config.accounts.programId);

async function runTradingProcess() {
    console.log("Create Maker...");
    const makerKeypair = await solanaClient.createAccountWithBalance();
    console.log("Maker: ", makerKeypair.publicKey);
    const makerWallet = new Wallet(makerKeypair);

    console.log("Create Taker...");
    const takerKeypair = await solanaClient.createAccountWithBalance();
    console.log("Taker: ", takerKeypair.publicKey);
    const takerWallet = new Wallet(takerKeypair);

    const providerMaker = new AnchorProvider(connection, makerWallet, { commitment: 'confirmed' });
    const providerTaker = new AnchorProvider(connection, takerWallet, { commitment: "confirmed" });
    const client = new OpenBookV2Client(providerMaker, programId);

    console.log("Create Tokens...");
    const quote = await solanaClient.createToken([makerKeypair, takerKeypair], 9);
    const base = await solanaClient.createToken([makerKeypair, takerKeypair], 9);
    console.log("Quote token " + quote["name"] + " ", quote["mint"]);
    console.log("Base token " + base["name"] + " ", base["mint"]);

    const marketName = quote["name"] + "-" + base["name"];
    const marketAddress = await createMarket(makerWallet, marketName, quote["mint"], base["mint"], client);

    // create Open Orders Account (for Maker only)
    const openOrdersAccount = await createOpenOrders(makerWallet, marketAddress, marketName, client);

    // place order to sell 10 base tokens
    await placeOrder(makerKeypair, marketAddress, openOrdersAccount, client, providerMaker);

    // get market total amount info
    await getMarketTotalAmount(makerWallet, marketAddress, client);

    // get users's Open Orders
    await getUserOpenOrders(openOrdersAccount, client);

    // taker places its own order to buy 10 base tokens
    await placeTakeOrder(makerKeypair, takerKeypair, marketAddress, client, providerTaker);

    // execute the deal
    await settleFunds(makerKeypair, makerWallet, marketAddress, openOrdersAccount, client, providerMaker);

    // check balances
}

runTradingProcess()

import { command, number, option, run } from "cmd-ts";
import { SolanaClient, connection } from "./utils/solanaClient"
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import "dotenv/config"
import config from './config';
import {
    createMarket,
    createOpenOrders,
    placeOrder,
    placeTakeOrder,
    settleFunds,
    getMarketOpenOrders,
    getUserOpenOrders
} from "./openbook/actions"

const ordersNumber = option({
    type: number,
    defaultValue: () => 2,
    long: "number-of-orders",
    short: "n",
    description: "Number of orders for Maker to place",
});

const app = command({
    name: "runTradingProcess",
    args: {
        ordersNumber,
    },
    handler: ({
        ordersNumber,
    }) => {
        runTradingProcess(ordersNumber);
    },
});

run(app, process.argv.slice(2));

async function runTradingProcess(ordersNumber: number) {
    const solanaClient = new SolanaClient();
    const programId = new PublicKey(config.accounts.programId);
    const makerKeypair = await solanaClient.createAccountWithBalance();
    console.log("Maker: ", makerKeypair.publicKey.toBase58());
    const makerWallet = new Wallet(makerKeypair);

    const takerKeypair = await solanaClient.createAccountWithBalance();
    console.log("Taker: ", takerKeypair.publicKey.toBase58());
    const takerWallet = new Wallet(takerKeypair);

    const providerMaker = new AnchorProvider(connection, makerWallet, { commitment: 'confirmed' });
    const providerTaker = new AnchorProvider(connection, takerWallet, { commitment: "confirmed" });
    const clientMaker = new OpenBookV2Client(providerMaker, programId);
    const clientTaker = new OpenBookV2Client(providerTaker, programId);

    const quote = await solanaClient.createToken([makerKeypair, takerKeypair], 9);
    const base = await solanaClient.createToken([makerKeypair, takerKeypair], 9);
    console.log("\nQuote token: " + quote["name"] + " ", quote["mint"].toBase58());
    console.log("Base token: " + base["name"] + " ", base["mint"].toBase58());

    const marketName = quote["name"] + "-" + base["name"];
    const marketAddress = await createMarket(makerWallet, marketName, quote["mint"], base["mint"], clientMaker);

    // create Open Orders Account (for Maker only)
    const openOrdersAccount = await createOpenOrders(makerWallet, marketAddress, marketName, clientMaker);

    // place order to sell 10 base tokens
    for (let i = 0; i < ordersNumber; i++) {
        console.log(i)
        await placeOrder(makerKeypair, marketAddress, openOrdersAccount, clientMaker, providerMaker);
    }

    // get market total amount info
    await getMarketOpenOrders(makerWallet, marketAddress, clientMaker);

    // get users's Open Orders
    await getUserOpenOrders(openOrdersAccount, clientMaker);

    // taker places its own order to buy 10 base tokens
    for (let i = 0; i < ordersNumber; i++) {
        console.log(i)
        await placeTakeOrder(makerKeypair, takerKeypair, marketAddress, clientTaker, providerTaker);
    }
    // execute the deal
    for (let i = 0; i < ordersNumber; i++) {
        console.log(i)
        await settleFunds(makerKeypair, makerWallet, marketAddress, openOrdersAccount, clientMaker, providerMaker);
    }
}
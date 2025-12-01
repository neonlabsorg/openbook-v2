import { command, number, option, run } from "cmd-ts";
import { SolanaClient, connection } from "./utils/solanaClient";
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { log } from "./utils/helpers";
import "dotenv/config";
import config from './config';
import {
    createMarket,
    createOpenOrders,
    placeOrder,
    placeTakeOrder,
    settleFunds,
    getMarketOpenOrders,
    getUserOpenOrders
} from "./openbook/actions";

const ordersNumber = option({
    type: number,
    defaultValue: () => 2,
    long: "orders",
    short: "n",
    description: "Number of orders for Maker to place",
});

const openOrderAccountsNumber = option({
    type: number,
    defaultValue: () => 2,
    long: "open-order-accounts",
    short: "a",
    description: "Number of orders for Maker to place",
});

const app = command({
    name: "runTradingProcess",
    args: {
        ordersNumber,
        openOrderAccountsNumber,
    },
    handler: ({
        ordersNumber,
        openOrderAccountsNumber,
    }) => {
        runTradingProcess(ordersNumber, openOrderAccountsNumber);
    },
});

run(app, process.argv.slice(2));

async function runTradingProcess(ordersNumber: number, openOrderAccountsNumber: number) {
    const solanaClient = new SolanaClient();
    const programId = new PublicKey(config.accounts.programId);
    const makerKeypair = await solanaClient.createAccountWithBalance();

    log.info("Maker: ", makerKeypair.publicKey.toBase58());
    const makerWallet = new Wallet(makerKeypair);

    let clientTakers: OpenBookV2Client[] = [];
    let takers: Keypair[] = [];
    let takerWallets: Wallet[] = [];
    let providerTakers: AnchorProvider[] = [];

    for (let i = 0; i < openOrderAccountsNumber; i++) {
        takers[i] = await solanaClient.createAccountWithBalance();
        log.info("[id_%s] Taker: %s", i, takers[i].publicKey.toBase58());
        takerWallets[i] = new Wallet(takers[i]);
        providerTakers[i] = new AnchorProvider(connection, takerWallets[i], { commitment: "confirmed" });
        clientTakers[i] = new OpenBookV2Client(providerTakers[i], programId);
    }

    const providerMaker = new AnchorProvider(connection, makerWallet, { commitment: 'confirmed' });
    const clientMaker = new OpenBookV2Client(providerMaker, programId);

    let signers: Keypair[] = [];
    for (let i = 0; i < openOrderAccountsNumber; i++) {
        signers.push(takers[i]);
    }
    signers.push(makerKeypair);

    const quote = await solanaClient.createToken(signers, 9);
    const base = await solanaClient.createToken(signers, 9);

    const marketName = quote["name"] + "-" + base["name"];
    const marketAddress = await createMarket(makerWallet, marketName, quote["mint"], base["mint"], clientMaker);

    // create Open Orders Accounts (for Maker only)
    const openOrderAccounts: PublicKey[] = [];
    for (let i = 0; i < openOrderAccountsNumber; i++) {
        openOrderAccounts.push(await createOpenOrders(i, makerWallet, marketAddress, marketName, clientMaker));
    }

    // place orders to sell 10 base tokens per one order
    for (let i = 0; i < openOrderAccountsNumber; i++) {
        for (let j = 0; j < ordersNumber; j++) {
            const id = i + "_" + j;
            await placeOrder(id, makerKeypair, marketAddress, openOrderAccounts[i], clientMaker, providerMaker);
        }
    }

    // get market total amount info
    await getMarketOpenOrders(makerWallet, marketAddress, clientMaker);

    // get users's Open Orders
    for (let i = 0; i < openOrderAccountsNumber; i++) {
        await getUserOpenOrders(openOrderAccounts[i], clientMaker);
    }

    // takers place their own orders to buy 10 base tokens
    for (let i = 0; i < openOrderAccountsNumber; i++) {
        for (let j = 0; j < ordersNumber; j++) {
            const id = i + "_" + j;
            await placeTakeOrder(id, takers[i], marketAddress, clientTakers[i], providerTakers[i]);
        }
    }
    // execute the deals
    for (let i = 0; i < openOrderAccountsNumber; i++) {
        for (let j = 0; j < ordersNumber; j++) {
            const id = i + "_" + j;
            await settleFunds(id, makerKeypair, makerWallet, marketAddress, openOrderAccounts[i], clientMaker, providerMaker);
        }
    }
}
import { command, number, option, run } from "cmd-ts";
import { SolanaClient, connection } from "../utils/solanaClient";
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { log } from "../utils/helpers";
import config from '../config';
import { Metrics } from "../utils/metricsManager";
import {
    createMarket,
    createOpenOrders,
    placeOrder,
    placeTakeOrder,
    settleFunds,
    getMarketOpenOrders,
    getUserOpenOrders
} from "../openbook/actions";
import Prometheus from "prom-client";
import { MintUtils } from "../utils/mintUtils";

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

const metrics = new Metrics(8080);

const settleFundsHistogram = new Prometheus.Histogram({
    name: "settle_funds_duration_seconds",
    help: "time to consume funds from an executed order",
    labelNames: ['owner', 'market']
});
metrics.registerMetric(settleFundsHistogram);

async function runTradingProcess(ordersNumber: number) {
    const solanaClient = new SolanaClient();
    const programId = new PublicKey(config.accounts.programId);
    const makerKeypair = await solanaClient.createAccountWithBalance();
    log.info("Maker: ", makerKeypair.publicKey.toBase58());
    const makerWallet = new Wallet(makerKeypair);

    const takerKeypair = await solanaClient.createAccountWithBalance();
    log.info("Taker: ", takerKeypair.publicKey.toBase58());
    const takerWallet = new Wallet(takerKeypair);

    const providerMaker = new AnchorProvider(connection, makerWallet, { commitment: 'confirmed' });
    const providerTaker = new AnchorProvider(connection, takerWallet, { commitment: "confirmed" });
    const clientMaker = new OpenBookV2Client(providerMaker, programId);
    const clientTaker = new OpenBookV2Client(providerTaker, programId);

    const quote = await solanaClient.createToken("Quote", [makerKeypair, takerKeypair], 9);
    const base = await solanaClient.createToken("Base", [makerKeypair, takerKeypair], 9);

    const marketName = quote["name"] + "-" + base["name"];
    const marketAddress = await createMarket(makerWallet, marketName, quote["mint"], base["mint"], clientMaker);

    let makerTokensBalancesBefore: Object = {};
    let makerTokensBalancesAfter: Object = {};
    let takerTokenBalancesBefore: Object = {};
    let takerTokenBalancesAfter: Object = {};

    const balances = await getPairBalances(
        providerMaker,
        quote["mint"],
        base["mint"],
        makerKeypair
    )
    makerTokensBalancesBefore[`Maker_${makerKeypair.publicKey}`] = balances;

    const balancesTaker = await getPairBalances(
        providerTaker,
        quote["mint"],
        base["mint"],
        takerKeypair
    )
    takerTokenBalancesBefore[`Taker_${takerKeypair.publicKey}`] = balancesTaker;

    // create Open Orders Account (for Maker only)
    const openOrdersAccount = await createOpenOrders(0, makerWallet, marketAddress, marketName, clientMaker);

    // place order to sell 10 base tokens
    for (let i = 0; i < ordersNumber; i++) {
        await placeOrder(i, makerKeypair, marketAddress, openOrdersAccount, clientMaker, providerMaker);
    }

    // get market total amount info
    await getMarketOpenOrders(makerWallet, marketAddress, clientMaker);

    // get users's Open Orders
    await getUserOpenOrders(openOrdersAccount, clientMaker);

    // taker places its own order to buy 10 base tokens
    for (let i = 0; i < ordersNumber; i++) {
        await placeTakeOrder(i, takerKeypair, marketAddress, clientTaker, providerTaker);
    }
    // execute the deal
    for (let i = 0; i < ordersNumber; i++) {
        await settleFunds(
            i,
            settleFundsHistogram,
            makerKeypair,
            makerWallet,
            marketAddress,
            openOrdersAccount,
            clientMaker,
            providerMaker
        );
    }

    const balancesAfter = await getPairBalances(
        providerMaker,
        quote["mint"],
        base["mint"],
        makerKeypair
    )
    makerTokensBalancesAfter[`Maker_${makerKeypair.publicKey}`] = balancesAfter;
    log.info("Tokens balance before: ", makerTokensBalancesBefore);
    log.info("Tokens balance after: ", makerTokensBalancesAfter);

    const balancesTakerAfter = await getPairBalances(
        providerTaker,
        quote["mint"],
        base["mint"],
        takerKeypair
    )
    takerTokenBalancesAfter[`Taker_${takerKeypair.publicKey}`] = balancesTakerAfter;
    log.info("Tokens balance before: ", takerTokenBalancesBefore);
    log.info("Tokens balance after: ", takerTokenBalancesAfter);
}

async function getPairBalances(provider: AnchorProvider, quoteMint: PublicKey, baseMint: PublicKey, account: Keypair): Promise<Object> {
    const mintUtils = new MintUtils(provider.connection, account);
    const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
        quoteMint,
        account,
        account.publicKey
    );

    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        baseMint,
        account,
        account.publicKey
    );

    return { "quoteBalance": userQuoteAcc.amount.toString(), "baseBalance": userBaseAcc.amount.toString() };
}
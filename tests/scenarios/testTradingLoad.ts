import { command, run } from "cmd-ts";
import { SolanaClient, connection } from "../utils/solanaClient";
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { log, runWithConcurrencyLimit, sleep } from "../utils/helpers";
import { Metrics } from "../utils/metricsManager";
import { Maker, Taker, Market, OpenOrderAccount } from "../openbook/core";
import {
    createMarket,
    placeTakeOrder,
} from "../openbook/actions";
import config from "../config";
import tradingConfig from "../tradingConfig";
import Prometheus from "prom-client";

const MAX_CONCURRENT_TAKE_ORDER = 100;

const app = command({
    name: "runTradingProcess",
    args: {},
    handler: () => {
        runTradingProcess().catch((error) => {
            log.error("Error in trading process: ", error);
            process.exit(1);
        });
    },
});

run(app, process.argv.slice(2));

// metrics server
const metrics = new Metrics(8080);

const userCounter = new Prometheus.Counter({
    name: 'users_number_by_type',
    help: 'number of Makers and Takers',
    labelNames: ['type']
});
metrics.registerMetric(userCounter);

const marketCounter = new Prometheus.Counter({
    name: 'markets_number',
    help: 'number of Markets',
    labelNames: ['name', 'owner']
});
metrics.registerMetric(marketCounter);

const tradingAccountCounter = new Prometheus.Counter({
    name: 'trading_account_number_by_owner',
    help: 'number of trading accounts per owner (Maker)',
    labelNames: ['owner', 'market']
});
metrics.registerMetric(tradingAccountCounter);

const orderCounter = new Prometheus.Counter({
    name: 'orders_number_by_type',
    help: 'number of orders',
    labelNames: ['type', 'owner', 'market', 'tradingAccount']
});
metrics.registerMetric(orderCounter);

const takeOrderCounter = new Prometheus.Counter({
    name: 'take_orders_number_by_type',
    help: 'number of take orders',
    labelNames: ['type', 'owner', 'market']
});
metrics.registerMetric(takeOrderCounter);

const settleFundsCounter = new Prometheus.Counter({
    name: 'settle_funds_number_by_owner',
    help: 'number of executed orders by Makers',
    labelNames: ['owner', 'market']
});
metrics.registerMetric(settleFundsCounter);

const settleFundsHistogram = new Prometheus.Histogram({
    name: "settle_funds_duration_seconds",
    help: "time to consume funds from an executed order",
    labelNames: ['owner', 'market']
});
metrics.registerMetric(settleFundsHistogram);

const consumeEventsHistogram = new Prometheus.Histogram({
    name: "consume_events_duration_seconds",
    help: "time to send consumeEvents and trigger token movements",
    labelNames: ['owner', 'market']
});
metrics.registerMetric(consumeEventsHistogram);

const takeOrderHistogram = new Prometheus.Histogram({
    name: "place_take_order_duration_seconds",
    help: "time to send take order",
    labelNames: ['owner', 'market']
});
metrics.registerMetric(takeOrderHistogram);

async function runTradingProcess(): Promise<void> {
    log.info("Start trading load to rpc url: %s", config.RPC);
    log.info("OpenbookV2 program_id: %s", config.accounts.programId);
    const ordersNumberPerOpenOrderAccount = tradingConfig.common.ordersPerTradingAccount;
    const openOrderAccountsNumber = tradingConfig.common.tradingAccountsPerMakersMarket;
    const makersNumber = tradingConfig.common.makers;
    const marketsNumber = tradingConfig.common.markets;
    // number of Takers (consider 1 Taker per 1 OpenOrdersAccount of a single Maker)
    const takersNumber = makersNumber * marketsNumber * openOrderAccountsNumber;
    const tradeQuantity = tradingConfig.orders.tradeQuantity;
    const ordersPerMaker = marketsNumber * openOrderAccountsNumber * ordersNumberPerOpenOrderAccount;

    log.info("Makers number: %s", makersNumber);
    log.info("Takers number: %s", takersNumber);
    log.info("Trading pairs number per Maker: %s", marketsNumber);
    log.info("Open Order Accounts per Maker: %s", openOrderAccountsNumber);
    log.info("Orders number per Open Order Account: %s", ordersNumberPerOpenOrderAccount);
    log.info("Common number of orders in orderbook: ", 2 * makersNumber * ordersPerMaker);

    const solanaClient = new SolanaClient();
    const programId = new PublicKey(config.accounts.programId);

    // Makers
    let makers: Maker[] = [];

    // Collect all promises for account creation
    const makerAccountPromises: Promise<Keypair>[] = [];
    for (let i = 0; i < makersNumber; i++) {
        makerAccountPromises.push(
            solanaClient.createAccountWithBalance(
                2 * marketsNumber * tradingConfig.consts.tokenCreation
                + marketsNumber * tradingConfig.consts.marketCreation
                + tradingConfig.consts.initialAccountBalance
            )
        );
    }

    // Wait for all accounts to be created
    const makerAccounts = await Promise.all(makerAccountPromises);

    // Process each account to create maker objects
    for (let i = 0; i < makersNumber; i++) {
        let maker = new Maker();
        maker.setAccount(makerAccounts[i]);
        maker.setWallet(new Wallet(maker.user.account));
        maker.setProvider(new AnchorProvider(connection, maker.user.wallet, { commitment: "confirmed" }));
        maker.setClient(new OpenBookV2Client(maker.user.provider, programId));

        log.info("[id_%s] Maker: %s", i, maker.user.account.publicKey.toBase58());
        makers.push(maker);
        userCounter.inc({ type: "Maker" });
    }
    await metrics.sendMetrics();

    // Takers
    let takers: Taker[] = [];

    // Collect all promises for account creation
    const accountPromises: Promise<Keypair>[] = [];
    for (let i = 0; i < takersNumber; i++) {
        accountPromises.push(solanaClient.createAccountWithBalance());
    }

    // Wait for all accounts to be created
    const accounts = await Promise.all(accountPromises);

    // Process each account to create taker objects
    for (let i = 0; i < takersNumber; i++) {
        let taker = new Taker();
        taker.setAccount(accounts[i]);
        taker.setWallet(new Wallet(taker.user.account));
        taker.setProvider(new AnchorProvider(connection, taker.user.wallet, { commitment: "confirmed" }))
        taker.setClient(new OpenBookV2Client(taker.user.provider, programId))
        log.info("[id_%s] Taker: %s", i, taker.user.account.publicKey.toBase58());
        takers.push(taker);
        userCounter.inc({ type: "Taker" });
    }
    await metrics.sendMetrics();


    // Signers: all Makers and Takers
    let signers: Keypair[] = [];
    for (let i = 0; i < makersNumber; i++) {
        signers.push(makers[i].user.account);
    }
    for (let i = 0; i < takersNumber; i++) {
        signers.push(takers[i].user.account);
    }

    //Deploy tokens
    let quotes: Object[] = [];
    let bases: Object[] = [];
    for (let i = 0; i < marketsNumber; i++) {
        const q = await solanaClient.createToken("Quote", signers, 9);
        quotes.push(q);
        const b = await solanaClient.createToken("Base", signers, 9);
        bases.push(b);
    }
    await metrics.sendMetrics();

    // Markets: add markets to Maker's property
    for (let i = 0; i < makers.length; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            let mk = new Market();
            mk.setBaseMint(bases[j]["mint"]);
            mk.setQuoteMint(quotes[j]["mint"]);
            mk.setName(quotes[j]["name"] + "-" + bases[j]["name"]);
            mk.setMaker(makers[i]);
            mk.setMarket(await createMarket(
                makers[i].user.wallet,
                mk.market.name,
                mk.market.quoteMint,
                mk.market.baseMint,
                makers[i].user.client
            ));
            marketCounter.inc(
                {
                    name: quotes[j]["name"] + "-" + bases[j]["name"],
                    owner: makers[i].user.account.publicKey.toBase58()
                }
            );
            makers[i].user.markets.push(mk);
        }
        log.info("Maker's %s markets: ", makers[i].user.account.publicKey, makers[i].user.markets);
    }
    await metrics.sendMetrics();

    // create Open Orders Accounts (for Makers only)
    let tradingAccounts: OpenOrderAccount[] = [];
    for (let j = 0; j < makers.length; j++) {
        const accounts = await makers[j].createOpenOrderAccounts(openOrderAccountsNumber, tradingAccountCounter);
        tradingAccounts.push(...accounts);
    }
    await metrics.sendMetrics();

    // place orders to sell 10 base tokens per one order
    for (let j = 0; j < makers.length; j++) {
        await makers[j].placeAskOrders(ordersNumberPerOpenOrderAccount, orderCounter);
    }
    await metrics.sendMetrics();

    // place take orders to buy 10 base tokens per one take order
    const takeOrderTasks: Array<() => Promise<string[]>> = [];
    for (let k = 0; k < openOrderAccountsNumber * makersNumber * marketsNumber; k++) {
        for (let m = 0; m < ordersNumberPerOpenOrderAccount; m++) {
            const id = `${k}_${m}`;
            takeOrderTasks.push(() =>
                placeTakeOrder(
                    id,
                    takeOrderHistogram,
                    takers[k].user.account,
                    tradingAccounts[k].account.marketAddress,
                    takers[k].user.client,
                    takers[k].user.provider
                )
            );
        }
    }

    const takeOrderResults = await runWithConcurrencyLimit(takeOrderTasks, MAX_CONCURRENT_TAKE_ORDER);

    for (let k = 0; k < openOrderAccountsNumber * makersNumber * marketsNumber; k++) {
        for (let m = 0; m < ordersNumberPerOpenOrderAccount; m++) {
            takeOrderCounter.inc(
                {
                    market: tradingAccounts[k].account.marketAddress.toBase58(),
                    owner: takers[k].user.account.publicKey.toBase58(),
                    type: "bid"
                }
            );
        }
    }
    await metrics.sendMetrics();

    const allTakeOrderSignatures = takeOrderResults.flat();
    await waitForFinalizedTransactions(allTakeOrderSignatures, "TakeOrder");

    // execute the deals and collect settle-funds transaction signatures
    const allSettleSignatures: string[] = [];
    for (let j = 0; j < makers.length; j++) {
        const makerSettleSignatures = await makers[j].settleFunds(
            settleFundsCounter,
            settleFundsHistogram,
            consumeEventsHistogram
        );
        allSettleSignatures.push(...makerSettleSignatures);
    }
    await waitForFinalizedTransactions(allSettleSignatures, "SettleFunds");
    await metrics.sendMetrics();
}

async function waitForFinalizedTransactions(signatures: string[], label: string): Promise<void> {
    const SIGNATURE_STATUS_CHUNK = 256;
    const POLL_INTERVAL_MS = 500;

    const pendingSignatures = new Set(signatures);

    while (pendingSignatures.size > 0) {
        const sigArray = Array.from(pendingSignatures);

        for (let i = 0; i < sigArray.length; i += SIGNATURE_STATUS_CHUNK) {
            const chunk = sigArray.slice(i, i + SIGNATURE_STATUS_CHUNK);
            const statusResponse = await connection.getSignatureStatuses(chunk);
            const statuses = statusResponse.value;

            for (let j = 0; j < statuses.length; j++) {
                const status = statuses[j];
                const signature = chunk[j];

                if (!status) {
                    continue;
                }

                if (status.err) {
                    log.error(
                        "%s transaction failed. Signature: %s, status: %s",
                        label,
                        signature,
                        JSON.stringify(status)
                    );
                }

                if (status.confirmationStatus === "finalized") {
                    pendingSignatures.delete(signature);
                }
            }
        }

        if (pendingSignatures.size > 0) {
            await sleep(POLL_INTERVAL_MS);
        }
    }
}

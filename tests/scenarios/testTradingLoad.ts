import { command, run } from "cmd-ts";
import { SolanaClient, connection } from "../utils/solanaClient";
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { log } from "../utils/helpers";
import { Metrics } from "../utils/metricsManager";
import { Maker, Taker, Market } from "../openbook/core";
import config from "../config";
import {
    createMarket,
    placeTakeOrder,
} from "../openbook/actions";
import tradingConfig from "../tradingConfig";
import Prometheus from "prom-client";

const app = command({
    name: "runTradingProcess",
    args: {},
    handler: () => {
        runTradingProcess();
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


async function runTradingProcess() {
    const ordersNumberPerOpenOrderAccount = tradingConfig.common.oredrsPerTradingAccount;
    const openOrderAccountsNumber = tradingConfig.common.tradingAccountsPerMakersMarket;
    const makersNumber = tradingConfig.common.makers;
    const marketsNumber = tradingConfig.common.markets;
    // number of Takers (consider 1 Taker per 1 OpenOrdersAccount of a single Maker, one Taker can place orders in range [0, 40))
    const takersNumber = makersNumber * marketsNumber * openOrderAccountsNumber;

    const solanaClient = new SolanaClient();
    const programId = new PublicKey(config.accounts.programId);

    // Makers
    let makers: Maker[] = [];

    for (let i = 0; i < makersNumber; i++) {
        let maker = new Maker();
        maker.setAccount(await solanaClient.createAccountWithBalance(
            2 * marketsNumber * tradingConfig.consts.tokenCreation
            + marketsNumber * tradingConfig.consts.marketCreation
            + tradingConfig.consts.initialAccountBalance
        ));
        maker.setWallet(new Wallet(maker.user.account));
        maker.setProvider(new AnchorProvider(connection, maker.user.wallet, { commitment: "confirmed" }));
        maker.setClient(new OpenBookV2Client(maker.user.provider, programId));

        log.info("[id_%s] Maker: %s", i, maker.user.account.publicKey.toBase58());
        makers.push(maker);
        userCounter.inc({ type: "Maker" });
    }

    // Takers
    let takers: Taker[] = [];

    for (let i = 0; i < takersNumber; i++) {
        let taker = new Taker();
        taker.setAccount(await solanaClient.createAccountWithBalance());
        taker.setWallet(new Wallet(taker.user.account));
        taker.setProvider(new AnchorProvider(connection, taker.user.wallet, { commitment: "confirmed" }))
        taker.setClient(new OpenBookV2Client(taker.user.provider, programId))
        log.info("[id_%s] Taker: %s", i, taker.user.account.publicKey.toBase58());
        takers.push(taker);
        userCounter.inc({ type: "Taker" });
    }

    // Signers: all Makers and Takers
    let signers: Keypair[] = [];
    for (let i = 0; i < makersNumber; i++) {
        signers.push(makers[i].user.account);
    }
    for (let i = 0; i < takersNumber; i++) {
        signers.push(takers[i].user.account);
    }

    // Markets: add markets to Maker's property
    for (let i = 0; i < makers.length; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            let mk = new Market();
            const quote = await solanaClient.createToken("Quote", signers, 9);
            const base = await solanaClient.createToken("Base", signers, 9);
            mk.setBaseMint(base["mint"]);
            mk.setQuoteMint(quote["mint"]);
            mk.setName(quote["name"] + "-" + base["name"]);
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
                    name: quote["name"] + "-" + base["name"],
                    owner: makers[i].user.account.publicKey.toBase58()
                }
            );
            makers[i].user.markets.push(mk);
        }
        log.info("Maker's %s markets: ", makers[i].user.account.publicKey, makers[i].user.markets);
    }


    // create Open Orders Accounts (for Makers only)
    for (let j = 0; j < makers.length; j++) {
        await makers[j].createOpenOrderAccounts(openOrderAccountsNumber, tradingAccountCounter);
    }

    // place orders to sell 10 base tokens per one order
    for (let j = 0; j < makers.length; j++) {
        await makers[j].placeAskOrders(ordersNumberPerOpenOrderAccount, orderCounter);
    }

    // takers place their own orders to buy 10 base tokens
    for (let i = 0; i < makersNumber; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            for (let k = 0; k < openOrderAccountsNumber; k++) {
                for (let m = 0; m < ordersNumberPerOpenOrderAccount; m++) {
                    const id = i + "_" + j + "_" + k + "_" + m;
                    await placeTakeOrder(
                        id,
                        takers[i].user.account,
                        makers[i].user.markets[j].market.address,
                        takers[i].user.client,
                        takers[i].user.provider
                    );
                    takeOrderCounter.inc(
                        {
                            market: makers[i].user.markets[j].market.name,
                            owner: takers[i].user.account.publicKey.toBase58(),
                            type: "bid"
                        }
                    );
                }
            }
        }
    }

    // execute the deals
    for (let j = 0; j < makers.length; j++) {
        await makers[j].settleFunds(settleFundsCounter, settleFundsHistogram);
    }

    await metrics.sendMetrics();
}
import { command, run } from "cmd-ts";
import { SolanaClient, connection } from "../utils/solanaClient";
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { log } from "../utils/helpers";
import { Metrics } from "../utils/metricsManager";
import { Maker, Taker, Market, OpenOrderAccount } from "../openbook/core";
import { IMarket, Balances } from "../utils/interfaces";
import config from "../config";
import {
    createMarket,
    placeTakeOrder,
} from "../openbook/actions";
import tradingConfig from "../tradingConfig";
import Prometheus from "prom-client";
import { MintUtils } from "../utils/mintUtils";
import { access } from "fs";

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
    log.info("Start trading load to rpc url: %s", config.RPC);
    log.info("OpenbookV2 program_id: %s", config.accounts.programId);
    const ordersNumberPerOpenOrderAccount = tradingConfig.common.oredrsPerTradingAccount;
    const openOrderAccountsNumber = tradingConfig.common.tradingAccountsPerMakersMarket;
    const makersNumber = tradingConfig.common.makers;
    const marketsNumber = tradingConfig.common.markets;
    // number of Takers (consider 1 Taker per 1 OpenOrdersAccount of a single Maker, one Taker can place orders in range [0, 40))
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

    let makersBaseBalancesAmount: bigint = BigInt(0);
    let makersBaseBalancesAmountAfter: bigint = BigInt(0);
    let makersQuoteBalancesAmount: bigint = BigInt(0);
    let makersQuoteBalancesAmountAfter: bigint = BigInt(0);
    let takersBaseBalancesAmount: bigint = BigInt(0);
    let takersBaseBalancesAmountAfter: bigint = BigInt(0);
    let takersQuoteBalancesAmount: bigint = BigInt(0);
    let takersQuoteBalancesAmountAfter: bigint = BigInt(0);

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

    //Deploy tokens
    let quotes: Object[] = [];
    let bases: Object[] = [];
    for (let i = 0; i < makers.length; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            const q = await solanaClient.createToken("Quote", signers, 9);
            quotes.push(q);
            const b = await solanaClient.createToken("Base", signers, 9);
            bases.push(b);
        }
    }

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

    for (let i = 0; i < makersNumber; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            const balances = await getPairBalances(
                makers[i].user.provider,
                makers[i].user.markets[j].market,
                makers[i].user.account
            );
            makersBaseBalancesAmount += balances.base;
            makersQuoteBalancesAmount += balances.quote;
        }
    }

    for (let i = 0; i < takers.length; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            const balances = await getPairBalances(
                takers[i].user.provider,
                makers[0].user.markets[j].market,
                takers[i].user.account
            );
            takersBaseBalancesAmount += balances.base;
            takersQuoteBalancesAmount += balances.quote;
        }
    }

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

    for (let k = 0; k < openOrderAccountsNumber * makersNumber * marketsNumber; k++) {
        for (let m = 0; m < ordersNumberPerOpenOrderAccount; m++) {
            const id = `${k}_${m}`
            await placeTakeOrder(
                id,
                takers[k].user.account,
                tradingAccounts[k].account.marketAddress,
                takers[k].user.client,
                takers[k].user.provider
            );
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

    for (let i = 0; i < takers.length; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            const balances = await getPairBalances(
                takers[i].user.provider,
                makers[0].user.markets[j].market,
                takers[i].user.account
            );
            takersBaseBalancesAmountAfter += balances.base;
            takersQuoteBalancesAmountAfter += balances.quote;
        }
    }

    // execute the deals
    for (let j = 0; j < makers.length; j++) {
        await makers[j].settleFunds(settleFundsCounter, settleFundsHistogram);
    }
    await metrics.sendMetrics();

    for (let i = 0; i < makersNumber; i++) {
        for (let j = 0; j < marketsNumber; j++) {
            const balances = await getPairBalances(
                makers[i].user.provider,
                makers[i].user.markets[j].market,
                makers[i].user.account
            )
            makersBaseBalancesAmountAfter += balances.base;
            makersQuoteBalancesAmountAfter += balances.quote;
        }
    }

    const makerBaseBalancesDiff = makersBaseBalancesAmount - makersBaseBalancesAmountAfter;
    const sellAmount = BigInt(makersNumber * ordersPerMaker * tradeQuantity * 10 ** 9);
    const buyAmount = sellAmount * BigInt(tradingConfig.orders.tradePrice);
    const fee = BigInt(((makersNumber * ordersPerMaker * tradeQuantity * 10 ** 9 * tradingConfig.orders.tradePrice) / tradingConfig.orders.makerFee));
    const makerQuoteBalancesDiff = (
        makersQuoteBalancesAmountAfter
        - makersQuoteBalancesAmount
        + fee
    );

    if (!(makerQuoteBalancesDiff === buyAmount)) {
        log.error(
            "Assertion failed: %s != %s",
            makerQuoteBalancesDiff,
            buyAmount
        );
        throw new Error("Balances mismatch");
    }

    if (!(makerBaseBalancesDiff === sellAmount)) {
        log.error(
            "Assertion failed: %s != %s",
            makerBaseBalancesDiff,
            sellAmount
        );
        throw new Error("Balances mismatch");
    }

    const takerBaseBalancesDiff = takersBaseBalancesAmountAfter - takersBaseBalancesAmount;
    const takerQuoteBalancesDiff = takersQuoteBalancesAmount - takersQuoteBalancesAmountAfter;

    if (!(takerQuoteBalancesDiff === buyAmount)) {
        log.error(
            "Assertion failed: %s != %s",
            takerQuoteBalancesDiff,
            buyAmount
        );
        throw new Error("Balances mismatch");
    }

    if (!(takerBaseBalancesDiff === sellAmount)) {
        log.error(
            "Assertion failed: %s != %s",
            takerQuoteBalancesDiff,
            sellAmount
        );
        throw new Error("Balances mismatch");
    }

}


async function getPairBalances(provider: AnchorProvider, market: IMarket, account: Keypair): Promise<Balances> {
    const mintUtils = new MintUtils(provider.connection, account);
    const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        account,
        account.publicKey
    );

    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        account,
        account.publicKey
    );

    return { account: account.publicKey, marketName: market.name, quote: userQuoteAcc.amount, base: userBaseAcc.amount }
}
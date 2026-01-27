import { Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { IMaker, ITaker, IMarket, IOpenOrderAccount } from "../utils/interfaces";
import { connection } from "../utils/solanaClient";
import {
    createOpenOrders,
    placeOrder,
    settleFunds
} from "../openbook/actions";
import { log, runWithConcurrencyLimit } from "../utils/helpers";
import Prometheus from "prom-client";

const MAX_CONCURRENT_SETTLE = 100;
const MAX_CONCURRENT_ORDERS = 100;

export class Maker {
    public user: IMaker = {
        account: new Keypair(),
        wallet: new Wallet(new Keypair()),
        provider: new AnchorProvider(connection, new Wallet(new Keypair()), { commitment: "confirmed" }),
        client: new OpenBookV2Client(new AnchorProvider(connection, new Wallet(new Keypair()), { commitment: "confirmed" })),
        markets: []
    };

    public setAccount(account: Keypair) {
        this.user.account = account;
    }

    public setWallet(wallet: Wallet) {
        this.user.wallet = wallet;
    }

    public setProvider(provider: AnchorProvider) {
        this.user.provider = provider;
    }

    public setClient(client: OpenBookV2Client) {
        this.user.client = client;
    }

    public setMarkets(markets: Market[]) {
        this.user.markets = markets;
    }

    public async createOpenOrderAccounts(n: number, accountCounter: Prometheus.Counter): Promise<OpenOrderAccount[]> {
        let result: OpenOrderAccount[] = [];
        for (let j = 0; j < this.user.markets.length; j++) {
            const accounts = await this.user.markets[j].createOpenOrderAccounts(n, accountCounter);
            result.push(...accounts);
        };
        return result;
    }

    public async placeAskOrders(n: number, orderCounter: Prometheus.Counter) {
        for (let j = 0; j < this.user.markets.length; j++) {
            await this.user.markets[j].placeOrders(n, orderCounter);
        };
    }

    public async settleFunds(
        settleFundsCounter: Prometheus.Counter,
        settleFundsHistogram: Prometheus.Histogram,
        consumeEventsHistogram: Prometheus.Histogram
    ): Promise<string[]> {
        const allSignatures: string[] = [];
        for (let j = 0; j < this.user.markets.length; j++) {
            const marketSignatures = await this.user.markets[j].settleFunds(
                settleFundsCounter,
                settleFundsHistogram,
                consumeEventsHistogram
            );
            allSignatures.push(...marketSignatures);
        }
        return allSignatures;
    }
}

export class Taker {
    public user: ITaker = {
        account: new Keypair(),
        wallet: new Wallet(new Keypair()),
        provider: new AnchorProvider(connection, new Wallet(new Keypair()), { commitment: "confirmed" }),
        client: new OpenBookV2Client(new AnchorProvider(connection, new Wallet(new Keypair()), { commitment: "confirmed" })),
    };

    public setAccount(account: Keypair) {
        this.user.account = account;
    }

    public setWallet(wallet: Wallet) {
        this.user.wallet = wallet;
    }

    public setProvider(provider: AnchorProvider) {
        this.user.provider = provider;
    }

    public setClient(client: OpenBookV2Client) {
        this.user.client = client;
    }
}

export class Market {
    public market: IMarket = {
        address: new Keypair().publicKey,
        baseMint: new Keypair().publicKey,
        quoteMint: new Keypair().publicKey,
        name: "",
        maker: new Maker(),
        openOrderAccounts: []
    };

    public setMarket(account: PublicKey) {
        this.market.address = account;
    }

    public setBaseMint(baseMint: PublicKey) {
        this.market.baseMint = baseMint;
    }

    public setQuoteMint(quoteMint: PublicKey) {
        this.market.quoteMint = quoteMint;
    }

    public setName(name: string) {
        this.market.name = name;
    }

    public setMaker(maker: Maker) {
        this.market.maker = maker;
    }

    public setOpenOrderAccounts(openOrderAccounts: OpenOrderAccount[]) {
        this.market.openOrderAccounts = openOrderAccounts;
    }

    public async createOpenOrderAccounts(n: number, accountCounter: Prometheus.Counter): Promise<OpenOrderAccount[]> {
        for (let k = 0; k < n; k++) {
            let openOrderAccount = new OpenOrderAccount();
            const id = k.toString() + "_" + this.market.maker.user.account.publicKey.toBase58().slice(0, 5);
            let account = await createOpenOrders(
                id,
                this.market.maker.user.wallet,
                this.market.address,
                this.market.name,
                this.market.maker.user.client
            );

            openOrderAccount.setAddress(account);
            openOrderAccount.setMarketAddress(this.market.address);

            this.market.openOrderAccounts.push(openOrderAccount);
            accountCounter.inc(
                {
                    owner: this.market.maker.user.account.publicKey.toBase58(),
                    market: this.market.name
                }
            );
        }
        log.info(
            "Maker %s market's Open Order Accounts: ",
            this.market.maker.user.account.publicKey.toBase58(),
            this.market.openOrderAccounts
        );
        return this.market.openOrderAccounts;
    }

    public async placeOrders(n: number, orderCounter: Prometheus.Counter) {
        const tasks: Array<() => Promise<{ order: Object; accountIndex: number }>> = [];

        for (let i = 0; i < this.market.openOrderAccounts.length; i++) {
            for (let j = 0; j < n; j++) {
                const id = this.market.openOrderAccounts[i].account.address.toBase58().slice(0, 5) + "_" + i + "_" + j;
                tasks.push(() =>
                    placeOrder(
                        id,
                        this.market.maker.user.account,
                        this.market.address,
                        this.market.openOrderAccounts[i].account.address,
                        this.market.maker.user.client,
                        this.market.maker.user.provider
                    ).then((order: Object) => {
                        orderCounter.inc(
                            {
                                type: "ask",
                                owner: this.market.maker.user.account.publicKey.toBase58(),
                                market: this.market.name,
                                tradingAccount: this.market.openOrderAccounts[i].account.address.toBase58()
                            }
                        );
                        return { order, accountIndex: i };
                    })
                );
            }
        }

        const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_ORDERS);

        for (const result of results) {
            this.market.openOrderAccounts[result.accountIndex].account.openOrders.push(result.order);
        }

        for (let i = 0; i < this.market.openOrderAccounts.length; i++) {
            log.info(
                "Maker %s: market's %s OpenOrderAcc %s, open orders: ",
                this.market.maker.user.account.publicKey.toBase58(),
                this.market.address.toBase58(),
                this.market.openOrderAccounts[i].account.address.toBase58(),
                this.market.openOrderAccounts[i].account.openOrders
            );
        }
    }

    public async settleFunds(settleFundsCounter: Prometheus.Counter, settleFundsHistogram: Prometheus.Histogram, consumeEventsHistogram: Prometheus.Histogram): Promise<string[]> {
        const tasks: Array<() => Promise<string[]>> = [];

        for (let i = 0; i < this.market.openOrderAccounts.length; i++) {
            for (let j = 0; j < this.market.openOrderAccounts[i].account.openOrders.length; j++) {
                const id = this.market.openOrderAccounts[i].account.openOrders[j]["orderPlacedTxSig"].slice(0, 5) + "_" + i + "_" + j;
                tasks.push(() =>
                    settleFunds(
                        id,
                        settleFundsHistogram,
                        consumeEventsHistogram,
                        this.market.maker.user.account,
                        this.market.maker.user.wallet,
                        this.market.address,
                        this.market.openOrderAccounts[i].account.address,
                        this.market.maker.user.client,
                        this.market.maker.user.provider
                    ).then((signatures: string[]) => {
                        settleFundsCounter.inc(
                            {
                                owner: this.market.maker.user.account.publicKey.toBase58(),
                                market: this.market.name
                            }
                        );
                        return signatures;
                    })
                );
            }
        }

        const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_SETTLE);
        return results.flat();
    }
}

export class OpenOrderAccount {
    public account: IOpenOrderAccount = {
        address: new Keypair().publicKey,
        marketAddress: new Keypair().publicKey,
        openOrders: []
    }

    public setAddress(account: PublicKey) {
        this.account.address = account;
    }

    public setMarketAddress(address: PublicKey) {
        this.account.marketAddress = address;
    }

    public setOpenOrders(orders: Object[]) {
        this.account.openOrders = orders;
    }
}

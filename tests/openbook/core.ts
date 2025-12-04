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
import { log } from "../utils/helpers";

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

    public async createOpenOrderAccounts(n: number) {
        for (let j = 0; j < this.user.markets.length; j++) {
            await this.user.markets[j].createOpenOrderAccounts(n);
        };
    }

    public async placeAskOrders(n: number) {
        for (let j = 0; j < this.user.markets.length; j++) {
            await this.user.markets[j].placeOrders(n);
        };
    }

    public async settleFunds() {
        for (let j = 0; j < this.user.markets.length; j++) {
            await this.user.markets[j].settleFunds();
        };
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

    public async createOpenOrderAccounts(n: number) {
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

            this.market.openOrderAccounts.push(openOrderAccount);
        }
        log.info(
            "Maker %s market's Open Order Accounts: ",
            this.market.maker.user.account.publicKey.toBase58(),
            this.market.openOrderAccounts
        );
    }

    public async placeOrders(n: number) {
        for (let i = 0; i < this.market.openOrderAccounts.length; i++) {
            for (let j = 0; j < n; j++) {
                const id = this.market.openOrderAccounts[i].account.address.toBase58().slice(0, 5) + "_" + i + "_" + j;
                let order: Object = await placeOrder(
                    id,
                    this.market.maker.user.account,
                    this.market.address,
                    this.market.openOrderAccounts[i].account.address,
                    this.market.maker.user.client,
                    this.market.maker.user.provider
                );
                this.market.openOrderAccounts[i].account.openOrders.push(order);
            }
            log.info(
                "Maker %s: market's %s OpenOrderAcc %s, open orders: ",
                this.market.maker.user.account.publicKey.toBase58(),
                this.market.address.toBase58(),
                this.market.openOrderAccounts[i].account.address.toBase58(),
                this.market.openOrderAccounts[i].account.openOrders
            );
        }
    }

    public async settleFunds() {
        for (let i = 0; i < this.market.openOrderAccounts.length; i++) {
            for (let j = 0; j < this.market.openOrderAccounts[i].account.openOrders.length; j++) {
                const id = this.market.openOrderAccounts[i].account.openOrders[j]["orderPlacedTxSig"].slice(0, 5) + "_" + i + "_" + j;
                await settleFunds(
                    id,
                    this.market.maker.user.account,
                    this.market.maker.user.wallet,
                    this.market.address,
                    this.market.openOrderAccounts[i].account.address,
                    this.market.maker.user.client,
                    this.market.maker.user.provider
                );
            };
        }
    }
}

export class OpenOrderAccount {
    public account: IOpenOrderAccount = {
        address: new Keypair().publicKey,
        openOrders: []
    }

    public setAddress(account: PublicKey) {
        this.account.address = account;
    }

    public setOpenOrders(orders: Object[]) {
        this.account.openOrders = orders;
    }
}

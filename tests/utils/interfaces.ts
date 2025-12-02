import { Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { connection } from "../utils/solanaClient";

export interface IMarket {
    address: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    name: string;
    openOrderAccounts: OpenOrderAccount[];
}

export class Market {
    public market: IMarket = {
        address: new Keypair().publicKey,
        baseMint: new Keypair().publicKey,
        quoteMint: new Keypair().publicKey,
        name: "",
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

    public setOpenOrderAccounts(openOrderAccounts: OpenOrderAccount[]) {
        this.market.openOrderAccounts = openOrderAccounts;
    }
}

export interface IMaker {
    account: Keypair;
    wallet: Wallet;
    provider: AnchorProvider;
    client: OpenBookV2Client;
    markets: Market[]
}

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
}

export interface ITaker {
    account: Keypair;
    wallet: Wallet;
    provider: AnchorProvider;
    client: OpenBookV2Client;
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

export interface IOpenOrderAccount {
    address: PublicKey;
    openOrders: Object[];
}

export class OpenOrderAccount {
    public openOrderAccount: IOpenOrderAccount = {
        address: new Keypair().publicKey,
        openOrders: [],
    }

    public setAddress(account: PublicKey) {
        this.openOrderAccount.address = account;
    }

    public setOpenOrders(orders: Object[]) {
        this.openOrderAccount.openOrders = orders;
    }
}
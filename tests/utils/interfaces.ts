import { Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { OpenBookV2Client } from "@openbook-dex/openbook-v2";
import { Maker, Market, OpenOrderAccount } from "../openbook/core";

export interface IMarket {
    address: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    name: string;
    maker: Maker,
    openOrderAccounts: OpenOrderAccount[];
}

export interface IMaker {
    account: Keypair;
    wallet: Wallet;
    provider: AnchorProvider;
    client: OpenBookV2Client;
    markets: Market[]
}

export interface ITaker {
    account: Keypair;
    wallet: Wallet;
    provider: AnchorProvider;
    client: OpenBookV2Client;
}

export interface IOpenOrderAccount {
    address: PublicKey;
    openOrders: Object[];
}

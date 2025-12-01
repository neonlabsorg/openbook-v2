import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { MintUtils } from "../utils/mintUtils";
import { Market } from "../utils/interfaces";
import {
    PlaceOrderArgs,
    SideUtils,
    uiBaseToLots,
    uiPriceToLots,
    uiQuoteToLots,
    PlaceOrderTypeUtils,
    SelfTradeBehaviorUtils,
    findAllMarkets
} from "@openbook-dex/openbook-v2";
import "dotenv/config";

var log = require('tracer').colorConsole({
    format: '{{timestamp}} [{{title}}]:: {{message}}',
    dateformat: 'HH:MM:ss.L'
});

export async function createMarket(wallet, marketName, quoteMint, baseMint, openbookClient): Promise<PublicKey> {
    const [ixs, signers] = await openbookClient.createMarketIx(
        wallet.publicKey,
        marketName,
        quoteMint,
        baseMint,
        new BN(1000000), /// Minimum price increment: 0.01 quote token per lot
        new BN(1000000), /// Minimum order size: 0.001 base token
        new BN(1000),
        new BN(1000),
        new BN(0),
        null,
        null,
        null,
        wallet.publicKey,
        wallet.publicKey
    );

    let tx;
    try {
        tx = await openbookClient.sendAndConfirmTransaction(ixs, {
            additionalSigners: signers,
        });
    } catch (error) {
        log.error("Error fetching data: %s", error);
    }

    const marketAddress = ixs[ixs.length - 1].keys[0].pubkey.toBase58();
    log.info("SIGNATURE market creation: %s", tx);
    log.info("Deployed market %s at %s. Quote mint: %s, Base mint: %s", marketName, marketAddress, quoteMint.toBase58(), baseMint.toBase58());
    return marketAddress;
}

export async function createOpenOrders(id, wallet, marketAddress, marketName, openbookClient): Promise<PublicKey> {
    const openOrdersAccount = await openbookClient.createOpenOrders(wallet.payer, marketAddress, marketName);
    log.info("[id_%s] Open Orders Account created: %s", id, openOrdersAccount.toBase58());
    return openOrdersAccount;
}

export async function placeOrder(id, makerKeypair, marketAddress, openOrdersAccount, openbookClient, provider) {
    const market = await openbookClient.program.account.market.fetch(marketAddress);
    const mintUtils = new MintUtils(provider.connection, makerKeypair);

    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    );

    const args: PlaceOrderArgs = {
        side: SideUtils.Ask,  // SELLING base token
        priceLots: uiPriceToLots(market, 25),  // Selling at $25
        maxBaseLots: uiBaseToLots(market, 10),  // Selling 10 base tokens
        maxQuoteLotsIncludingFees: uiQuoteToLots(market, 300),  // Will receive ~$250
        clientOrderId: new BN(Date.now()),
        orderType: PlaceOrderTypeUtils.Limit,  // Limit order - will rest on book
        expiryTimestamp: new BN(0),
        selfTradeBehavior: SelfTradeBehaviorUtils.DecrementTake,
        limit: 255  // How many matching orders from the opposite side to walk through
    };

    const timestamp = new BN(Date.now()).toString();

    const [ix, signers] = await openbookClient.placeOrderIx(
        openOrdersAccount,
        marketAddress,
        market,
        userBaseAcc.address,
        args,
        []
    );

    const tx = await openbookClient.sendAndConfirmTransaction([ix], { additionalSigners: signers });
    log.info("[id_%s] Order placed. Timestamp: %s, signature: %s", id, timestamp, tx);
}

export async function placeTakeOrder(id, takerKeypair, marketAddress, openbookClient, provider) {
    const market = await openbookClient.program.account.market.fetch(marketAddress);

    const mintUtils = new MintUtils(provider.connection, takerKeypair);
    const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        takerKeypair,
        takerKeypair.publicKey
    );

    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        takerKeypair,
        takerKeypair.publicKey
    );

    const args: PlaceOrderArgs = {
        side: SideUtils.Bid,  // BUYING base token
        priceLots: uiPriceToLots(market, 30),  // Willing to pay up to $30
        maxBaseLots: uiBaseToLots(market, 10),  // Buying 10 base tokens
        maxQuoteLotsIncludingFees: uiQuoteToLots(market, 1000),  // Max $350 spend
        clientOrderId: new BN(Date.now()),
        orderType: PlaceOrderTypeUtils.Market,
        expiryTimestamp: new BN(0),
        selfTradeBehavior: SelfTradeBehaviorUtils.DecrementTake,
        limit: 255  // How many matching orders from the opposite side to walk through
    };

    let remainings = new Array<PublicKey>();
    const [ix, signers] = await openbookClient.placeTakeOrderIx(
        marketAddress,
        market,
        userBaseAcc.address,
        userQuoteAcc.address,
        null,
        args,
        remainings
    );

    let tx;
    try {
        tx = await openbookClient.sendAndConfirmTransaction([ix], signers);
    } catch (error) {
        log.error("Error fetching data: %s", error);
    }
    log.info("[id_%s] TakeOrder placed. Tx signature: %s", id, tx);
}

export async function settleFunds(id, makerKeypair, makerWallet, marketAddress, openOrdersAccount, openbookClient, provider) {
    const market = await openbookClient.program.account.market.fetch(marketAddress);

    const consumeEventsIx = await openbookClient.consumeEventsIx(
        marketAddress,
        market,
        new BN(10), // Limit - process up to 10 events
        [openOrdersAccount]
    );

    const consumeTx = await openbookClient.sendAndConfirmTransaction([consumeEventsIx], {});
    log.info("[id_%s] ConsumeEventsIx sig: %s", id, consumeTx);

    const openOrdersData = await openbookClient.program.account.openOrdersAccount.fetch(openOrdersAccount);

    const mintUtils = new MintUtils(provider.connection, makerKeypair);
    const userQuoteAcc = await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    );

    const userBaseAcc = await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    );

    const [ix, signers] = await openbookClient.settleFundsIx(
        openOrdersAccount,
        openOrdersData,
        marketAddress,
        market,
        userBaseAcc.address,
        userQuoteAcc.address,
        null,
        makerWallet.publicKey
    );

    const tx = await openbookClient.sendAndConfirmTransaction([ix], { additionalSigners: signers });
    log.info("[id_%s] SettleFunds tx sig: %s", id, tx);
}

export async function getMarkets(connection, programId, provider): Promise<Market[]> {
    const markets = await findAllMarkets(connection, programId, provider);
    log.info("Find All Markets Result: %s", markets);
    return markets;
}

export async function getMarketOpenOrders(makerWallet, marketAddress, openbookClient): Promise<PublicKey[]> {
    const openOrders = await openbookClient.findOpenOrdersForMarket(makerWallet.publicKey, marketAddress);

    for (const openOrderPubkey of openOrders) {
        const openOrder = await openbookClient.deserializeOpenOrderAccount(openOrderPubkey);
        if (openOrder) {
            if (openOrder.version != 1) {
                throw "using an old open orders account, please close it"
            }
        }
    }
    log.info("Open Orders: %s", openOrders);
    return openOrders;
}

export async function getUserOpenOrders(openOrdersAccount, openbookClient): Promise<PublicKey[]> {
    const openOrdersAccountInfo = await openbookClient.program.account.openOrdersAccount.fetch(openOrdersAccount);

    // Filter only open orders (isFree === 0)
    const filteredOpenOrders = openOrdersAccountInfo.openOrders.filter(function (el) {
        return el.isFree === 0;
    });

    log.info("OpenOrdersAccount: %s, Open Orders: %s", openOrdersAccount, filteredOpenOrders);
    return filteredOpenOrders;
}

export async function getOpenOrdersAccountFreeBalances(openOrdersAccount, openbookClient): Promise<Object> {
    const openOrdersAccountInfo = await openbookClient.program.account.openOrdersAccount.fetch(openOrdersAccount);

    log.info("OpenOrdersAccount: %s. Quote free balance: %s", openOrdersAccount, openOrdersAccountInfo.position.quoteFreeNative.toString());
    log.info("OpenOrdersAccount: %s. Base free balance: %s", openOrdersAccount, openOrdersAccountInfo.position.baseFreeNative.toString());
    return {
        "quote_free_balance": openOrdersAccountInfo.position.quoteFreeNative.toString(),
        "base_free_balance": openOrdersAccountInfo.position.baseFreeNative.toString()
    }
}

export async function getTotalAmountsForOpenOrders(makerWallet, marketAddress, openbookClient): Promise<Object> {
    const openOrders = await openbookClient.findOpenOrdersForMarket(makerWallet.publicKey, marketAddress);
    let result = {};
    for (const openOrderPubkey of openOrders) {
        const openOrder = await openbookClient.deserializeOpenOrderAccount(openOrderPubkey);
        if (openOrder) {
            if (openOrder.version != 1) {
                throw "using an old open orders account, please close it"
            }

            const bidsQuoteLots = openOrder.position.bidsQuoteLots.toNumber();
            const asksBaseLots = openOrder.position.asksBaseLots.toNumber();
            log.info("Total amount for Open Orders in Market %s, bidsQuoteLots: %s, asksBaseLots: %s", marketAddress.toBase58(), bidsQuoteLots, asksBaseLots)
            result[openOrderPubkey] = [bidsQuoteLots, asksBaseLots]
        }
    }
    return result;

}

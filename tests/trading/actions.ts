import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { MintUtils } from "../utils/mint_utils";
import {
    PlaceOrderArgs,
    SideUtils,
    uiBaseToLots,
    uiPriceToLots,
    uiQuoteToLots,
    PlaceOrderTypeUtils,
    SelfTradeBehaviorUtils
} from "@openbook-dex/openbook-v2";
import "dotenv/config"

export async function createMarket(wallet, marketName, quoteMint, baseMint, openbookClient): Promise<PublicKey> {
    const [ixs, signers] = await openbookClient.createMarketIx(
        wallet.publicKey,
        marketName,
        quoteMint,
        baseMint,
        new BN(1000000),   /// Minimum price increment: 0.01 TEST per lot
        new BN(1000000), /// Minimum order size: 0.001 pSOL
        new BN(1000),
        new BN(1000),
        new BN(0),
        null,
        null,
        null,
        wallet.publicKey,
        wallet.publicKey
    );

    console.log("Create market ", marketName)
    let tx;
    try {
        tx = await openbookClient.sendAndConfirmTransaction(ixs, {
            additionalSigners: signers,
        });
    } catch (error) {
        console.error("Error fetching data:", error);
    }

    const marketAddress = ixs[ixs.length - 1].keys[0].pubkey.toBase58();
    console.log("\nSIGNATURE market creation:", tx);
    console.log("\nDeployed market", marketName, "at:", marketAddress);
    console.log("Quote mint:", quoteMint.toBase58());
    console.log("Base mint:", baseMint.toBase58());
    return marketAddress
}

export async function createOpenOrders(wallet, marketAddress, marketName, openbookClient): Promise<PublicKey> {
    const openOrdersAccount = await openbookClient.createOpenOrders(wallet.payer, marketAddress, marketName);
    console.log("Create open orders account: ", openOrdersAccount);
    return openOrdersAccount;
}

export async function placeOrder(makerKeypair, marketAddress, openOrdersAccount, openbookClient, provider) {
    const market = await openbookClient.program.account.market.fetch(marketAddress);

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

    console.log(userQuoteAcc.amount.toString(), 'MAKER quote balance before');
    console.log(userBaseAcc.amount.toString(), 'MAKER base balance before\n');
    console.log(new BN(Date.now()), 'new BN(Date.now())');

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

    const [ix, signers] = await openbookClient.placeOrderIx(
        openOrdersAccount,
        marketAddress,
        market,
        userBaseAcc.address,
        args,
        []
    );

    const tx = await openbookClient.sendAndConfirmTransaction([ix], { additionalSigners: signers });
    console.log("Placed order ", tx, '\n');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER quote balance after');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER base balance after');
}

export async function placeTakeOrder(makerKeypair, takerKeypair, marketAddress, openbookClient, provider) {
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

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER quote balance before');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER base balance before \n');

    console.log(userQuoteAcc.amount.toString(), 'TAKER quote balance before');
    console.log(userBaseAcc.amount.toString(), 'TAKER base balance before\n');

    const args: PlaceOrderArgs = {
        side: SideUtils.Bid,  // BUYING base token
        priceLots: uiPriceToLots(market, 30),  // Willing to pay up to $30
        maxBaseLots: uiBaseToLots(market, 10),  // Buying 10 base tokens
        maxQuoteLotsIncludingFees: uiQuoteToLots(market, 350),  // Max $350 spend
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
        console.error("Error fetching data:", error);
    }
    console.log("Take order ", tx, '\n');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        takerKeypair,
        takerKeypair.publicKey
    )).amount.toString(), 'TAKER quote balance after');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        takerKeypair,
        takerKeypair.publicKey
    )).amount.toString(), 'TAKER base balance after \n');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER quote balance after');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER base balance after \n');
}

export async function settleFunds(makerKeypair, makerWallet, marketAddress, openOrdersAccount, openbookClient, provider) {
    const market = await openbookClient.program.account.market.fetch(marketAddress);

    let openOrdersData = await openbookClient.program.account.openOrdersAccount.fetch(openOrdersAccount);
    console.log('\nMaker\'s OpenOrders balances before consumeEventsIx:');
    console.log('- Quote free:', openOrdersData.position.quoteFreeNative.toString());
    console.log('- Base free:', openOrdersData.position.baseFreeNative.toString());

    const consumeEventsIx = await openbookClient.consumeEventsIx(
        marketAddress,
        market,
        new BN(10), // Limit - process up to 10 events
        [new PublicKey(openbookClient.accounts.openOrders)]
    );

    const consumeTx = await openbookClient.sendAndConfirmTransaction([consumeEventsIx], {});
    console.log("\nconsumeEventsIx ", consumeTx, "\n");

    openOrdersData = await openbookClient.program.account.openOrdersAccount.fetch(openOrdersAccount);
    console.log('Maker\'s OpenOrders balances after consumeEventsIx:');
    console.log('- Quote free:', openOrdersData.position.quoteFreeNative.toString());
    console.log('- Base free:', openOrdersData.position.baseFreeNative.toString(), '\n');

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

    console.log(userQuoteAcc.amount.toString(), 'MAKER quote balance before');
    console.log(userBaseAcc.amount.toString(), 'MAKER base balance before');

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
    console.log("\nsettleFunds ", tx, "\n");

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.quoteMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER quote balance after');

    console.log((await mintUtils.getOrCreateTokenAccount(
        market.baseMint,
        makerKeypair,
        makerKeypair.publicKey
    )).amount.toString(), 'MAKER base balance after');
}

export async function getMarketTotalAmount(makerWallet, marketAddress, openbookClient) {
    const openorders = await openbookClient.findOpenOrdersForMarket(makerWallet.publicKey, marketAddress);

    for (const openOrderPubkey of openorders) {
        const openOrder = await openbookClient.deserializeOpenOrderAccount(openOrderPubkey);
        if (openOrder) {
            if (openOrder.version != 1) {
                throw "using an old open orders account, please close it"
            }

            console.log("bidsQuoteLots", openOrder.position.bidsQuoteLots.toNumber());
            console.log("asksBaseLots", openOrder.position.asksBaseLots.toNumber());
        }
    }
}

export async function getUserOpenOrders(openOrdersAccount, openbookClient) {
    const openOrdersAccountInfo = await openbookClient.program.account.openOrdersAccount.fetch(openOrdersAccount);

    // Filter only open orders (isFree === 0)
    const filteredOpenOrders = openOrdersAccountInfo.openOrders.filter(function (el) {
        return el.isFree === 0;
    });

    console.log(filteredOpenOrders, 'filteredOpenOrders');
}
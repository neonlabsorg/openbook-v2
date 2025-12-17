const tradingConfig = {
    common: {
        makers: 2, // number of Makers
        markets: 1, //number of trading pairs per Maker
        tradingAccountsPerMakersMarket: 2, // number of OpenOrdersAccount per each Maker
        oredrsPerTradingAccount: 2, // number of orders per each Trading account, range [0, 24)
        ordersDistributionStrategy: "HalfSellHalfBuy", // number of orders with side ask = all order's number / 2, number of orders with side bid = all order's number / 2
    },
    consts: {
        initialAccountBalance: 100, // SOLs
        initialMintAmount: 10000, // tokens
        marketCreation: 2, // SOLs
        tokenCreation: 0.6, // SOLs
    },
    orders: {
        tradeQuantity: 10, // token's quantity to buy or to sell per one order
        tradePrice: 25, // token's price to sell or buy
        makerFee: 1000
    }
}

export default tradingConfig;
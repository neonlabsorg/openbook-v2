import { PublicKey } from '@solana/web3.js';

const config = {
    RPC: "http://103.50.32.150:8899",
    accounts: {
        programId: "4euFSfDacDh7XauCX1mQ6dxyS48WFoykMTLVsWfjSncz",
        market: "9z4Pvg61EQVhN38xxxfNsfC9UcuwpJ4FGYoEpDoEXv7R",
        quoteMint: "2oFUfmGG4dYhdnSayYYV2HuHDcCyua4fMMuFj3A24PgH",
        baseMint: "HCCF5Swui7Qu9FvZR9L2sXGyLMmfX144C7SQSuQvevUt",
        openOrders: "Bi5PDbxCWUgdt41GYFemGyDJrQLMv531ejtVjSm7nwFv" /// This is the position account of the maker in order to be able to register Limit orders in the orderbook
    },
    constants: {
        BooksideSpace: 90944 + 8,
        EventHeapSpace: 91280 + 8
    },
    utils: {
        pdas: {
            market: function(marketKp: PublicKey, programId: PublicKey) {
                return PublicKey.findProgramAddressSync(
                    [Buffer.from('Market'), marketKp.toBuffer()],
                    programId
                )
            },
            eventAuthority: function(programId: PublicKey) {
                return PublicKey.findProgramAddressSync(
                    [Buffer.from('__event_authority')],
                    programId
                )
            }
        }
    }
}

export default config
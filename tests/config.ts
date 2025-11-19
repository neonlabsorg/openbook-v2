import { PublicKey } from '@solana/web3.js';

const config = {
    RPC: "https://api.devnet.solana.com",
    accounts: {
        programId: "opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb",
        market: "9ZAste493xzkUw5WWnWHLnCczPCLBpL4sDEgrJZgtUcr",
        quoteMint: "E9tm4XvYu6J2G8CtJecagpMwG5oQkfLnTKvqWSEvjjnu",
        baseMint: "AZ97Q9DgwbuWANo1rj4KAhNdftbSZ7n6bAsbJVXosN1a",
        openOrders: "Hu96AJDpzxxks7KwsBzD7wEokyvM2diBr8YuQnDeo5s7" /// This is the position account of the maker in order to be able to register Limit orders in the orderbook
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
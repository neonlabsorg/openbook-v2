import { PublicKey } from '@solana/web3.js';

const config = {
    RPC: "https://api.devnet.solana.com",
    accounts: {
        programId: "4euFSfDacDh7XauCX1mQ6dxyS48WFoykMTLVsWfjSncz",
        market: "6R3ydQjmYqkPN6FkrbCUY3fZSFficYMjDEKzJsGBKPBy",
        quoteMint: "5Y45hvBy3vhu6EufhaFvpvgNS5AzqAfbqVfr7kVWQVGx",
        baseMint: "EcJU9vayKwYM61CuZqLSvTQN28qDe9nofNoSPa2jwQ1Y",
        openOrders: "81ZY3F8dsr3iAuctozogAJTbUkuGGTpWmfmxfT5Uh7z3"
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
import { PublicKey } from '@solana/web3.js';

const config = {
    RPC: "https://api.devnet.solana.com",
    accounts: {
        programId: "4euFSfDacDh7XauCX1mQ6dxyS48WFoykMTLVsWfjSncz",
        market: "J4poCDHBeSuQVnApXYrGBsm9niJbCg8WCRNgvU3kdPZe",
        quoteMint: "7KestsAnwRKCKDTBwEE5h1d4gC2vQZdHpf3S94FitNcX",
        baseMint: "6X25RMXNM91TuTGLrij63ojbCBJ18ANnu43vHks1QL3Z",
        openOrders: "5f9XZ2GvGrAWkjHwavBhacBR5eGmdS1unkabmivDJZE9"
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
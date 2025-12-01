import { PublicKey } from '@solana/web3.js';

const config = {
    RPC: "https://api.devnet.solana.com",
    accounts: {
        programId: "FBz12zuKVbmMA1Nao422RocMjm2vPDVUaeKWAprH7Y1r",
    },
    constants: {
        BooksideSpace: 90944 + 8,
        EventHeapSpace: 91280 + 8
    },
    utils: {
        pdas: {
            market: function (marketKp: PublicKey, programId: PublicKey) {
                return PublicKey.findProgramAddressSync(
                    [Buffer.from('Market'), marketKp.toBuffer()],
                    programId
                )
            },
            eventAuthority: function (programId: PublicKey) {
                return PublicKey.findProgramAddressSync(
                    [Buffer.from('__event_authority')],
                    programId
                )
            }
        }
    }
}

export default config;
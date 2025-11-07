import { PublicKey } from '@solana/web3.js';

const config = {
    RPC: "https://api.devnet.solana.com",
    accounts: {
        programId: "AasRc9CPvisthu12jwhu3otuQvoRgy1TQdiY9HFKfW2K",
        market: "HFzCfEYi4nBCHFvdRYFA97MvheTxZR6wDXmrwrMk1K9g",
        baseMint: "6JnVBKDoipzEHxiGTMjHs8kkcGF5dznMwr9HJfBkPC24",
        quoteMint: "3U9kQid4uK599LqYXS7ptjCYtAseEmuQFY227PXpkVRH",
        openOrders: "GLHFQHQEVMFSipFnWLWBuCBiGDxA7ebPuARAcBZrjACp"
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
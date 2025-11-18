import { PublicKey } from '@solana/web3.js';

const config = {
    RPC: "https://api.devnet.solana.com",
    accounts: {
        programId: "opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb",
        market: "Bozkex8fMN8K4AK3T1JWbv2jnm7dKj6N6bDhCapckYCK",
        quoteMint: "CfZS8DA2tyVQPk9aRErZCD88CdXAhgaXob1VJQUavSj9",
        baseMint: "7GkZbwCs2rquF54smcjDaLRNKSwj5qxLKAMHxMBhP8fW",
        openOrders: "8ZvYbbn7XKo6LDtTSEj2qB6DabnoqPejwpTe1gVmT4Ex"
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
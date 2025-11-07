import { Connection, PublicKey } from '@solana/web3.js';
import config from './config';
import { findAllMarkets } from "@openbook-dex/openbook-v2";

const connection = new Connection(config.RPC, 'confirmed');
const programId = new PublicKey(config.accounts.programId);
  
async function getMarkets() {
    const markets = await findAllMarkets(connection, programId);
    console.log(markets, 'markets');
}
getMarkets();
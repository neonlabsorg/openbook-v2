import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import config from '../config';
import { findAllMarkets } from "@openbook-dex/openbook-v2";
import bs58 from 'bs58';
import "dotenv/config";

const connection = new Connection(config.RPC, 'confirmed');
const makerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.MAKER_PK as string)
);
const makerWallet = new Wallet(makerKeypair);

const provider = new AnchorProvider(connection, makerWallet, {commitment: "confirmed"});
const programId = new PublicKey(config.accounts.programId);
  
async function init() {
    const markets = await findAllMarkets(connection, programId, provider);
    console.log(markets, 'findAllMarkets');
}
init();
// swap.mjs

import bs58 from "bs58";
import BN from "bn.js";
import BigNumber from "bignumber.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Raydium, CurveCalculator } from "@raydium-io/raydium-sdk-v2";
import { getMint } from "@solana/spl-token";
import dotenv from "dotenv";

dotenv.config();


export async function swap(privateKeyBase58, amount, direction) {
    // Create a new Keypair from the private key
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    // Set up the connection to the Solana network
    const rpc =
        process.env.SOLANA_ENDPOINT ||
        "https://va.pixellabz.io/";
    const solanaConnection = new Connection(rpc);

    // Initialize Raydium SDK
    const raydium = await Raydium.load({
        connection: solanaConnection,
        owner: wallet,
        disableLoadToken: false,
    });

    if (!raydium) {
        throw new Error("Failed to load Raydium SDK");
    }

    // Define constants for the pool and tokens
    const AMM_ID = new PublicKey(process.env.AMM_ID);
    const MINT = new PublicKey(process.env.MINT);
    const WSOL = new PublicKey(
        "So11111111111111111111111111111111111111112"
    ); // Wrapped SOL

    // Fetch pool information from RPC
    const data = await raydium.cpmm.getPoolInfoFromRpc(AMM_ID.toBase58());
    if (!data) {
        throw new Error("Failed to get pool info from RPC");
    }

    const { poolInfo, poolKeys, rpcData } = data;
    if (!poolInfo || !rpcData) {
        throw new Error("Failed to get pool info or rpcData");
    }

    // Determine trade direction
    const baseIn = direction.toUpperCase() === "BUY";

    // Fetch token decimals
    let tokenDecimals;
    let amountInBN;

    if (baseIn) {
        // 'BUY' direction: swapping SOL for TAKY
        tokenDecimals = 9; // SOL has 9 decimals
        amountInBN = new BN(
            new BigNumber(amount).multipliedBy(10 ** tokenDecimals).toFixed(0)
        );
    } else {
        // 'SELL' direction: swapping TAKY for SOL
        const mintInfo = await getMint(solanaConnection, MINT);
        tokenDecimals = mintInfo.decimals;
        amountInBN = new BN(
            new BigNumber(amount).multipliedBy(10 ** tokenDecimals).toFixed(0)
        );
    }

    // Calculate swap result
    const swapResult = CurveCalculator.swap(
        amountInBN,
        baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
        baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
        rpcData.configInfo.tradeFeeRate
    );

    // Prepare the swap transaction
    const { execute } = await raydium.cpmm.swap({
        poolInfo,
        poolKeys,
        inputAmount: amountInBN,
        swapResult,
        slippage: 10, // 0.1% slippage tolerance
        baseIn,

    });

    // Get the latest blockhash for transaction finalization
    const blockHash = await solanaConnection.getLatestBlockhash();

    // Execute the transaction
    const { txId } = await execute({
        recentBlockHash: blockHash.blockhash,
        sendAndConfirm: true,
    });

    console.log(`Transaction successful: https://solscan.io/tx/${txId}`);

    // Fetch transaction fee
    const txInfo = await solanaConnection.getParsedTransaction(txId, 'confirmed');
    const fee = txInfo.meta.fee / 10 ** 9; // Convert lamports to SOL

    return { txId, fee };
}


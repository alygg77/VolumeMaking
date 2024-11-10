const fs = require('fs');
const bs58 = require('bs58');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAccount, getMint } = require('@solana/spl-token');

// Replace with your desired RPC endpoint.
const connection = new Connection('https://va.pixellabz.io/');

// The token address you are interested in
const TOKEN_MINT_ADDRESS = '8Eewax7ooBdi5nwkp7VwittjEV9mVWAGhN1KVRJroeMR';

// Function to convert wallets.txt to wallets.csv
function convertTxtToCsv(inputFile, outputFile) {
    const wallets = fs.readFileSync(inputFile, 'utf-8').split('\n').filter(Boolean);

    const csvContent = wallets.map(wallet => {
        return wallet.split(' ').join(','); // Replace spaces with commas
    }).join('\n');

    fs.writeFileSync(outputFile, csvContent);
    console.log(`Converted ${inputFile} to ${outputFile}`);
}

// Function to fetch SOL balance
async function getSolBalance(publicKey) {
    try {
        const balance = await connection.getBalance(publicKey);
        return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
        console.error(`Error fetching SOL balance for ${publicKey}:`, error);
        return 0;
    }
}

// Function to fetch SPL Token balance
async function getTokenBalance(publicKey, tokenMintAddress) {
    try {
        const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
            mint: new PublicKey(tokenMintAddress),
        });

        if (tokenAccounts.value.length === 0) {
            return 0;
        }

        const tokenAccountInfo = await getAccount(connection, tokenAccounts.value[0].pubkey);
        const mintInfo = await getMint(connection, new PublicKey(tokenMintAddress));

        return Number(tokenAccountInfo.amount) / Math.pow(10, mintInfo.decimals);
    } catch (error) {
        console.error(`Error fetching token balance for ${publicKey}:`, error);
        return 0;
    }
}

// Function to process wallets.csv and fetch balances
async function processWallets(file) {
    const wallets = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);

    const results = [['index', 'pub_key', 'pr_key', 'sol_bal', 'token_bal']]; // CSV header

    for (const wallet of wallets) {
        const [index, pubKeyStr, privKeyStr] = wallet.split(',');

        if (!pubKeyStr || !privKeyStr) continue;

        const publicKey = new PublicKey(pubKeyStr);
        const secretKey = bs58.decode(privKeyStr); // Decode the base58 private key
        const keypair = Keypair.fromSecretKey(secretKey);

        const solBalance = await getSolBalance(publicKey);
        const tokenBalance = await getTokenBalance(publicKey, TOKEN_MINT_ADDRESS);

        // Write the public key and private key in base58 format
        results.push([index, publicKey.toBase58(), bs58.encode(keypair.secretKey), solBalance, tokenBalance]);
    }

    // Write the fetched balances to a new CSV file
    const csvContent = results.map(row => row.join(',')).join('\n');
    fs.writeFileSync('wallet_balances.csv', csvContent);

    console.log('Wallet balances written to wallet_balances.csv');
}

// First, convert wallets.txt to wallets.csv
convertTxtToCsv('wallets.txt', 'wallets.csv');

// Then, process the wallets.csv to fetch balances
processWallets('wallets.csv');

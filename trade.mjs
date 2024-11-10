import fs from 'fs';
import { swap } from './swap.mjs'; // Adjust the path if necessary
import dotenv from "dotenv";
import { exec } from 'child_process';

dotenv.config();

const delaySeconds = parseInt(process.env.DELAY_SECONDS, 10);
const A = parseInt(process.env.A, 10); // Minimum percentage
const B = parseInt(process.env.B, 10); // Maximum percentage


// Helper function to delay execution
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function runFetchBalances() {
    return new Promise((resolve, reject) => {
        exec('node fetch_balances.js', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error running fetch_balances.js: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.error(`Stderr from fetch_balances.js: ${stderr}`);
            }
            console.log(`Output from fetch_balances.js: ${stdout}`);
            resolve(stdout);
        });
    });
}


// Function to read and parse wallet_balances.csv
function readWallets(filePath) {
    const data = fs.readFileSync(filePath, 'utf-8');
    const lines = data.trim().split('\n');
    const wallets = [];

    for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) {
            continue;
        }

        // Skip header line if present
        if (line.startsWith('index')) {
            continue;
        }

        const fields = line.split(',');

        // Ensure the line has exactly 5 fields
        if (fields.length !== 5) {
            console.warn(`Skipping malformed line: ${line}`);
            continue;
        }

        const [index, pub_key, pr_key, sol_bal, token_bal] = fields;

        wallets.push({
            index: parseInt(index),
            pub_key: pub_key.trim(),
            pr_key: pr_key.trim(),
            sol_bal: parseFloat(sol_bal),
            token_bal: parseFloat(token_bal),
        });
    }

    return wallets;
}

// Function to write wallets back to wallet_balances.csv


// Function to pick a random percentage between A and B
function getRandomPercentage(min, max) {
    return Math.random() * (max - min) + min;
}

// Function to randomly choose 'BUY' or 'SELL'
function getRandomTradeDirection() {
    return Math.random() < 0.5 ? 'BUY' : 'SELL';
}

// Function to distribute amount among wallets with as few wallets as possible
function distributeAmount(wallets, totalAmount, direction) {
    // Constants for fees
    const transactionFee = 0.00006; // Typical transaction fee
    const computeBudgetFee = 0.000065; // Adjust based on your compute budget units
    const ataCreationFee = 0.00513928; // Approximate rent-exempt balance for ATA
    const totalAdditionalFee = transactionFee + computeBudgetFee + ataCreationFee;

    // Sort wallets based on balance in descending order
    wallets.sort((a, b) => {
        const balanceA = direction === 'BUY' ? a.sol_bal : a.token_bal;
        const balanceB = direction === 'BUY' ? b.sol_bal : b.token_bal;
        return balanceB - balanceA;
    });

    const distribution = [];
    let remainingAmount = totalAmount;

    for (const wallet of wallets) {
        const balance = direction === 'BUY' ? wallet.sol_bal : wallet.token_bal;

        if (balance <= 0) {
            continue; // Skip wallets with zero balance
        }

        // Calculate the maximum usable amount
        let maxUsableAmount;

        if (direction === 'BUY') {
            // For 'BUY', deduct the total fees from the balance
            const availableBalance = wallet.sol_bal - totalAdditionalFee;
            maxUsableAmount = Math.max(availableBalance, 0);
        } else {
            // For 'SELL', no additional SOL is needed from the SOL balance
            maxUsableAmount = balance;
        }

        const amountToUse = Math.min(maxUsableAmount, remainingAmount);

        if (amountToUse <= 0) {
            continue; // Skip if amount to use is zero or negative
        }

        distribution.push({
            wallet,
            amount: amountToUse,
        });

        remainingAmount -= amountToUse;

        if (remainingAmount <= 0) {
            break; // We've distributed the total amount
        }
    }

    if (remainingAmount > 0) {
        console.warn('Not enough balance to distribute the total amount.');
        return [];
    }

    return distribution;
}

// Function to update wallet balances after swap
function updateWalletBalance(wallet, amount, direction) {
    const fee = 0.00006 + 0.000065; // Total fee to deduct per swap

    console.log(`Updating balance for wallet ${wallet.index}`);
    console.log(`Before update: SOL Balance = ${wallet.sol_bal}, Token Balance = ${wallet.token_bal}`);
    console.log(`Amount: ${amount}, Direction: ${direction}, Fee: ${fee}`);

    if (direction === 'BUY') {
        // Deduct SOL balance
        wallet.sol_bal -= amount + fee;
        // Increase token balance
        wallet.token_bal += amount; // Adjust based on actual swap result if necessary
    } else {
        // Deduct token balance
        wallet.token_bal -= amount;
        // Increase SOL balance
        wallet.sol_bal += amount - fee; // Deduct fee from SOL received
    }
    if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid amount for wallet ${wallet.index}: ${amount}`);
        return;
    }
    if (
        isNaN(wallet.sol_bal) ||
        isNaN(wallet.token_bal) ||
        !isFinite(wallet.sol_bal) ||
        !isFinite(wallet.token_bal)
    ) {
        console.error(`Invalid balance detected for wallet ${wallet.index}`);
        wallet.sol_bal = Math.max(wallet.sol_bal, 0);
        wallet.token_bal = Math.max(wallet.token_bal, 0);
    }

    // Ensure balances are not negative
    wallet.sol_bal = Math.max(wallet.sol_bal, 0);
    wallet.token_bal = Math.max(wallet.token_bal, 0);
    console.log(`After update: SOL Balance = ${wallet.sol_bal}, Token Balance = ${wallet.token_bal}\n`);
}

const withTimeout = (promise, timeoutMs) => {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Transaction timed out')), timeoutMs)
        ),
    ]);
};


// Main function
async function main() {
    while (true) {
        const wallets = readWallets('wallet_balances.csv');

        // Sum up total balances
        const totalSolBal = wallets.reduce((sum, wallet) => sum + wallet.sol_bal, 0);
        const totalTokenBal = wallets.reduce(
            (sum, wallet) => sum + wallet.token_bal,
            0
        );

        console.log(`Total SOL Balance: ${totalSolBal}`);
        console.log(`Total Token Balance: ${totalTokenBal}`);

        // Randomly pick 'BUY' or 'SELL'
        const direction = getRandomTradeDirection();
        console.log(`Trade Direction: ${direction}`);

        // Randomly pick a percentage between A and B
        const percentage = getRandomPercentage(A, B);
        console.log(`Random Percentage: ${percentage.toFixed(2)}%`);

        // Calculate the total amount to swap
        const totalAmount =
            direction === 'BUY'
                ? (totalSolBal * percentage) / 100
                : (totalTokenBal * percentage) / 100;
        console.log(`Total Amount to Swap: ${totalAmount}`);

        // Distribute the amount among wallets
        const distribution = distributeAmount(wallets, totalAmount, direction);

        if (distribution.length === 0) {
            console.warn('Failed to distribute the amount among wallets.');
            return;
        }

        console.log('Distribution among wallets:');
        for (const entry of distribution) {
            console.log(
                `Wallet Index: ${entry.wallet.index}, Amount: ${entry.amount}`
            );
        }

        // Perform swaps sequentially
        const swapResults = [];

        for (let index = 0; index < distribution.length; index++) {
            const entry = distribution[index];
            const privateKey = entry.wallet.pr_key;
            const amount = entry.amount;

            // Wrap the swap function with a 5-second timeout
            try {
                const txId = await withTimeout(swap(privateKey, amount, direction), 5000);
                swapResults.push({ entry, txId });
                console.log(`Swap successful for wallet ${entry.wallet.index}: ${txId}`);
            } catch (error) {
                swapResults.push({ entry, error });
                console.error(`Swap failed for wallet ${entry.wallet.index}: ${error.message}`);
            }

            // Introduce a 1-second delay between each transaction
            if (index < distribution.length - 1) {
                await delay(1000);
            }
        }

        // Wait for n seconds before the next iteration
        console.log(`Waiting for ${delaySeconds} seconds before the next cycle...`);
        try {
            await runFetchBalances();
        } catch (error) {
            console.error(`Error occurred while fetching balances: ${error.message}`);
            continue;
        }
        await delay(delaySeconds * 1000);
    }
}


// Run the main function
main().catch((error) => {
    console.error(`An error occurred: ${error.message}`);
});

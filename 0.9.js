const fs = require('fs');
const parse = require('csv-parse').parse; // Correct import for async parse
const stringify = require('csv-stringify').stringify;

// Read the CSV file
fs.readFile('wallet_balances.csv', (err, data) => {
    if (err) {
        console.error('Error reading the file:', err);
        return;
    }

    // Parse the CSV
    parse(data, { columns: true }, (err, records) => {
        if (err) {
            console.error('Error parsing the CSV:', err);
            return;
        }

        // Multiply sol_bal and token_bal by 0.9
        const updatedRecords = records.map(record => {
            record.sol_bal = (parseFloat(record.sol_bal) * 0.9).toFixed(9);
            record.token_bal = (parseFloat(record.token_bal) * 0.9).toFixed(9);
            return record;
        });

        // Stringify the updated records back to CSV
        stringify(updatedRecords, { header: true }, (err, output) => {
            if (err) {
                console.error('Error stringifying the CSV:', err);
                return;
            }

            // Write the updated CSV back to the file
            fs.writeFile('updated_wallet_balances.csv', output, (err) => {
                if (err) {
                    console.error('Error writing the file:', err);
                    return;
                }
                console.log('Updated wallet balances saved to updated_wallet_balances.csv');
            });
        });
    });
});

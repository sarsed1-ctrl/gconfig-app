'use strict';

const fs = require('fs');
const path = require('path');
const { loadCatalog, importTellimusXlsx } = require('../lib/amflex/client');
const { computeQuote } = require('../lib/amflex/pricing');

async function main() {
    const sample = process.argv[2];
    if (!sample || !fs.existsSync(sample)) {
        console.error('Usage: node scripts/test-amflex-pricing.js <path-to.xlsx>');
        process.exit(1);
    }
    const bytes = fs.readFileSync(sample);
    const catalog = await loadCatalog('EE');
    const imported = await importTellimusXlsx(bytes);
    const quote = computeQuote(imported.payload, catalog);
    console.log(JSON.stringify({ orderId: imported.orderId, itemCount: imported.payload.items.length, quote }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

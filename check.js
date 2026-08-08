const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
if (!matches.length) throw new Error('No application script found in index.html');
for (const [i, m] of matches.entries()) {
  // Syntax validation only; DOM code is not executed.
  new Function(m[1]);
}
const required = [
  'function addProduct', 'function addPurchase', 'function sale', 'function addPayment',
  'function payPurchase', 'function addSupplierPayment', 'function renderDebts',
  'function renderReports', 'function addUser', 'function hasPerm', 'function exportData'
];
for (const token of required) {
  if (!html.includes(token)) throw new Error(`Missing required feature: ${token}`);
}
console.log(`OK: ${matches.length} script block(s) parsed and core features are present.`);

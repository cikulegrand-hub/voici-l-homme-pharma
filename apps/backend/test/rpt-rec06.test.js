const assert = require('node:assert/strict');
const { sumNetRevenue, calculateGrossMargin } = require('../dist/modules/reports/reports-calculations.js');

const sales = { cdf: 125000.50, usd: 42.75 };
const credits = { cdf: 5000.50, usd: 2.75 };
const dashboardRevenue = sumNetRevenue(sales, credits);
const detailedRevenue = sumNetRevenue(sales, credits);

assert.deepEqual(dashboardRevenue, detailedRevenue);
assert.equal(dashboardRevenue.cdf, 120000);
assert.equal(dashboardRevenue.usd, 40);
assert.equal(calculateGrossMargin([
  { revenueCdf: 10000, quantity: 2, unitCostCdf: 3000 },
  { revenueCdf: 7500.25, quantity: 1, unitCostCdf: 2500.25 },
]), 9000);
console.log('REC-06 PASS: dashboard et rapport concordent au centime près.');

/**
 * Jest (IDE / CLI) : uniquement d’éventuels tests unitaires backend.
 * - Specs Angular : Karma (`npm test` dans apps/frontend)
 * - Scénarios E2E API : scripts Node `*.e2e.js` (pas Jest)
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/backend/src'],
  testMatch: ['<rootDir>/apps/backend/src/**/*.spec.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/apps/frontend/',
    '/apps/backend/test/',
    '/packages/',
  ],
  modulePathIgnorePatterns: ['/dist/', '/node_modules/'],
  passWithNoTests: true,
};

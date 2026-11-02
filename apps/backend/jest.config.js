/** Empêche Jest (extension IDE) de traiter les scripts E2E comme des suites Jest. */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],
  passWithNoTests: true,
};

/**
 * Les tests frontend sont exécutés par Karma (`ng test`), pas par Jest.
 * Cette config existe uniquement pour que l’extension Jest de l’IDE n’essaie
 * pas de parser les fichiers *.spec.ts Angular.
 */
module.exports = {
  rootDir: __dirname,
  testMatch: [],
  testPathIgnorePatterns: ['/'],
  passWithNoTests: true,
};

module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'stakewars'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      {
        allowConstantExport: true,
        allowExportNames: [
          'useSectors',
          'useSectorImages',
          'useTransactionToast',
          'useWallet',
        ],
      },
    ],
    'prettier/prettier': 'warn',
    // Keeps UI code on src/ui tokens and components; see AGENTS.md.
    'stakewars/no-adhoc-styles': 'error',
  },
};

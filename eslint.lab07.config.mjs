import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['client/src/**/*.ts', 'server/src/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url))
      }
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error'
    }
  }
];

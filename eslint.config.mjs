import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['lib/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.cjs', '*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['*.cjs', '*.mjs', 'scripts/**'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', process: 'readonly' },
    },
  },
  {
    // Jest mocks are untyped by nature; the source keeps the strict rules.
    files: ['__tests__/**'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
  prettier,
]);

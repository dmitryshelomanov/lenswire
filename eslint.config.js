const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      'android/**',
      'ios/**',
      '.expo/**',
      'modules/lenswire-proxy/android/build/**',
      'sandbox/**',
      'targets/**',
      'website/**',
    ],
  },
  {
    files: ['scripts/**/*.{js,cjs}', 'plugins/**/*.{js,cjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // external → blank → @/ alias → blank → relative
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000'], ['^node:', '^@?\\w'], ['^@/'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
]);

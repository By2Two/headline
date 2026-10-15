import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'artifacts/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'one-var': ['error', 'never'],
      'padded-blocks': ['error', 'never'],
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
      'prefer-arrow-callback': 'error',
      'default-case': 'error',
      'no-fallthrough': 'error',
      'no-unused-vars': [
        'error',
        { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^React$' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'id-length': [
        'error',
        {
          min: 3,
          properties: 'never',
          exceptions: [
            'id',
            'fs',
            'os',
            'ok',
            'at',
            'on',
            'it',
            'to',
            '_',
            'W',
            'N',
            'XP',
            'MW',
            'mw',
            'C4',
            'go',
            'ci',
            'js',
          ],
        },
      ],
    },
  },
];

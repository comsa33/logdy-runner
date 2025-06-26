/**@type {import('eslint').Linter.Config} */
// eslint-disable-next-line no-undef
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: [
        '@typescript-eslint',
    ],
    extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
    ],
    rules: {
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'no-console': 'off',
        'no-unused-vars': 'off' // typescript-eslint가 처리함
    },
    env: {
        node: true,
        es6: true
    },
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    }
};
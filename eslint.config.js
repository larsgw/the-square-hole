const { defineConfig } = require('eslint/config')

const tsParser = require('@typescript-eslint/parser')
const typescriptEslint = require('@typescript-eslint/eslint-plugin')
const js = require('@eslint/js')

const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
})

module.exports = defineConfig([{
    extends: compat.extends('eslint:recommended', 'plugin:@typescript-eslint/recommended'),
    languageOptions: {
        parser: tsParser,
    },
    plugins: {
        '@typescript-eslint': typescriptEslint,
    },
    rules: {
        indent: ['error', 2, {
            SwitchCase: 1,
        }],
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
        }],
    },
}])

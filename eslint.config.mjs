import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import jsdoc from 'eslint-plugin-jsdoc'

export default [
    {
        ignores: ['dist/', 'log-server.js', 'babel.config.cjs', 'jest.config.js'],
    },
    { files: ['**/*.{js,mjs,cjs,ts}'] },
    { languageOptions: { globals: globals.node } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    jsdoc.configs['flat/recommended-typescript-error'],
    {
        rules: {
            'no-unused-labels': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            'no-explicit-any': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-case-declarations': 'off',
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-returns': 'off',
            'jsdoc/check-param-names': 'off',
            'jsdoc/require-yields': 'off',
            'jsdoc/require-yields-type': 'off',
            'jsdoc/multiline-blocks': 'off',
            'jsdoc/tag-lines': 'off',
            'jsdoc/require-description': 'off',
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-returns-description': 'off',
        },
    },
    // CommonJS entrypoints and test utilities use require(); keep TypeScript sources on ESM/import style.
    {
        files: ['**/*.cjs', 'test-data/**/*.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
]

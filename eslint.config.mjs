import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
    {
        ignores: ['dist/', 'log-server.js', 'babel.config.cjs', 'jest.config.js'],
    },
    { files: ['**/*.{js,mjs,cjs,ts}'] },
    { languageOptions: { globals: globals.node } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
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

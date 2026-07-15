// Consumed by @vercel/ncc during `npm run build` to transform the ESM-only
// `double-metaphone` and `uuid` node_modules into CommonJS for `dist/`.
module.exports = {
    presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
}

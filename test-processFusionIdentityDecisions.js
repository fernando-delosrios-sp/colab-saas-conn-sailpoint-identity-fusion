const fs = require('fs')

const path = 'src/services/fusionService/fusionService.ts'
let content = fs.readFileSync(path, 'utf8')

console.log(content.includes('public async processFusionIdentityDecisions()'))

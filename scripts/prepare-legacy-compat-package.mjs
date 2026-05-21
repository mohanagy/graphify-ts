import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { prepareLegacyCompatPackage } from '../dist/src/infrastructure/compat-package.js'

const outDirArg = process.argv[2]
const outDir = resolve(outDirArg ?? '.release/legacy-graphify-ts-package')
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
  throw new Error('package.json is missing version')
}

prepareLegacyCompatPackage({
  outDir,
  version: packageJson.version,
  licenseText: readFileSync(resolve('LICENSE'), 'utf8'),
})

console.log(`Legacy compatibility package prepared at ${outDir}`)

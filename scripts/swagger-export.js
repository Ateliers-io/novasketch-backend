#!/usr/bin/env node

// swagger-export.js: Generates swagger.json from the JSDoc annotations.
// Used by CI to produce an API spec artifact on every push.
//
// Usage: node scripts/swagger-export.js

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerSpec from '../src/config/swagger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '..', 'swagger.json');

writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));
console.log(`✅ Swagger spec written to ${outputPath}`);
console.log(`   ${Object.keys(swaggerSpec.paths || {}).length} paths documented`);

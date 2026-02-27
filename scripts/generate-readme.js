#!/usr/bin/env node

// generate-readme.js: Analyses the codebase and updates README.md
//
// 1. Loads the Swagger spec to extract all API endpoints
// 2. Walks src/ to build a directory tree
// 3. Replaces marked sections in README.md with fresh content
//
// Usage: node scripts/generate-readme.js

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import swaggerSpec from '../src/config/swagger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const README_PATH = resolve(ROOT, 'README.md');

// ─── Build directory tree ───

function buildTree(dir, prefix = '', isRoot = true) {
    const IGNORE = ['node_modules', '.git', 'coverage', '.env', 'swagger.json', 'pnpm-lock.yaml'];
    const entries = readdirSync(dir)
        .filter(name => !IGNORE.includes(name))
        .sort((a, b) => {
            // Directories first, then files
            const aIsDir = statSync(resolve(dir, a)).isDirectory();
            const bIsDir = statSync(resolve(dir, b)).isDirectory();
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });

    let tree = '';
    if (isRoot) {
        tree += `${relative(ROOT, dir) || 'novasketch-backend'}/\n`;
    }

    entries.forEach((entry, index) => {
        const fullPath = resolve(dir, entry);
        const isLast = index === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            tree += `${prefix}${connector}${entry}/\n`;
            tree += buildTree(fullPath, prefix + childPrefix, false);
        } else {
            tree += `${prefix}${connector}${entry}\n`;
        }
    });

    return tree;
}

// ─── Build API endpoints table from Swagger spec ───

function buildApiSection() {
    const paths = swaggerSpec.paths || {};
    const groups = {};

    for (const [path, methods] of Object.entries(paths)) {
        for (const [method, detail] of Object.entries(methods)) {
            const tag = (detail.tags && detail.tags[0]) || 'Other';
            if (!groups[tag]) groups[tag] = [];
            groups[tag].push({
                method: method.toUpperCase(),
                path,
                summary: detail.summary || '',
            });
        }
    }

    let md = '';
    for (const [tag, endpoints] of Object.entries(groups)) {
        md += `#### ${tag}\n\n`;
        md += '| Method | Endpoint | Description |\n';
        md += '|--------|----------|-------------|\n';
        for (const ep of endpoints) {
            md += `| \`${ep.method}\` | \`${ep.path}\` | ${ep.summary} |\n`;
        }
        md += '\n';
    }

    md += `* **WebSocket Gateway**: \`ws://<server>:<port>/<room-id>\` — real-time drawing sync and awareness updates.\n`;
    md += `\n> 📖 **Interactive docs**: Start the server and visit [\`/api-docs\`](http://localhost:3000/api-docs) for the full Swagger UI.\n`;

    return md;
}

// ─── Replace content between markers ───

function replaceSection(content, startMarker, endMarker, newContent) {
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx === -1 || endIdx === -1) {
        console.warn(`⚠️  Markers not found: ${startMarker} / ${endMarker}`);
        return content;
    }

    return (
        content.substring(0, startIdx + startMarker.length) +
        '\n' +
        newContent +
        '\n' +
        content.substring(endIdx)
    );
}

// ─── Main ───

const readme = readFileSync(README_PATH, 'utf8');

const treeContent = '```text\n' + buildTree(ROOT) + '```';
const apiContent = buildApiSection();

let updated = replaceSection(readme, '<!-- TREE:START -->', '<!-- TREE:END -->', treeContent);
updated = replaceSection(updated, '<!-- API:START -->', '<!-- API:END -->', apiContent);

writeFileSync(README_PATH, updated);
console.log('✅ README.md updated');
console.log(`   ${Object.keys(swaggerSpec.paths || {}).length} API endpoints documented`);

#!/usr/bin/env node
// Builds the release notes for one version: whatever the changelog says about it, if there is a
// changelog, plus install instructions.
//
//   node scripts/notes.mjs hp-in-bar 1.0.7
import fs from 'node:fs';
import path from 'node:path';
import { moduleDir, readManifest, manifestUrl, downloadUrl } from './lib/modules.mjs';

const [id, version] = process.argv.slice(2);
if (!id || !version) {
    console.error('usage: node scripts/notes.mjs <module-id> <version>');
    process.exit(1);
}

const manifest = readManifest(id);
const sections = [];

const changelog = path.join(moduleDir(id), 'CHANGELOG.md');
if (fs.existsSync(changelog)) {
// Everything under the `## <version>` heading until the next one at the same level.
    const lines = fs.readFileSync(changelog, 'utf8').split(/\r?\n/);
    const start = lines.findIndex(line => /^##\s/.test(line) && line.includes(version));
    if (start !== -1) {
        const rest = lines.slice(start + 1);
        const end = rest.findIndex(line => /^##\s/.test(line));
        const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
        if (body) sections.push(body);
    }
}

sections.push([
    `**${manifest.title}** ${version} — Foundry VTT v${manifest.compatibility.minimum}+`,
    '',
    manifest.description,
    '',
    '### Install',
    '',
    "Paste this manifest URL into Foundry's *Install Module* dialog:",
    '',
    '```',
    manifestUrl(id),
    '```',
    '',
    `Or download [\`${id}.zip\`](${downloadUrl(id, version)}) and drop the extracted folder into \`Data/modules/\`.`
].join('\n'));

process.stdout.write(`${sections.join('\n\n---\n\n')}\n`);

#!/usr/bin/env node
// Sets up a new module under modules/<id>/ with a manifest, a stub script and a README, all
// already pointing at the right URLs so you can release it without editing anything.
//
//   npm run new-module -- concentration-halo "Concentration Halo" "Marks concentrating tokens."
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moduleDir, listModuleIds, manifestUrl, downloadUrl, projectUrl, writeManifest } from './lib/modules.mjs';

const [id, title, description = ''] = process.argv.slice(2);

if (!id || !title) {
    console.error('\nusage: npm run new-module -- <module-id> "<Title>" ["<description>"]\n');
    process.exit(1);
}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    console.error(`\n✗ "${id}" is not a valid module id. Use lowercase kebab-case, e.g. concentration-halo.\n`);
    process.exit(1);
}
if (listModuleIds().includes(id)) {
    console.error(`\n✗ module "${id}" already exists.\n`);
    process.exit(1);
}

const version = '0.1.0';
const dir = moduleDir(id);
fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });

writeManifest(id, {
    id,
    title,
    description: description || `${title} for Foundry VTT.`,
    authors: [{ name: 'Zeralius' }],
    version,
    compatibility: { minimum: '13', verified: '14' },
    relationships: { systems: [{ id: 'dnd5e', type: 'system', compatibility: {} }] },
    esmodules: [`scripts/${id}.js`],
    url: projectUrl(),
    manifest: manifestUrl(id),
    download: downloadUrl(id, version)
});

fs.writeFileSync(path.join(dir, 'scripts', `${id}.js`), `const MODULE_ID = '${id}';

Hooks.once('init', () => {
    // game.settings.register(MODULE_ID, 'example', {
    //     name: 'Example Setting',
    //     scope: 'client', config: true, type: Boolean, default: true
    // });
});

Hooks.once('ready', () => {
    console.log(\`\${MODULE_ID} | ready\`);
});
`, 'utf8');

fs.writeFileSync(path.join(dir, 'README.md'), `# ${title}

${description || `${title} for Foundry VTT.`}

Requires Foundry VTT v13 or newer.
`, 'utf8');

// Add it to the bundle right away. Leaving this until later means the one-click install quietly
// misses the new module until someone remembers.
execFileSync(process.execPath, [fileURLToPath(new URL('./bundle.mjs', import.meta.url))], { stdio: 'inherit' });

console.log(`\n✓ Created modules/${id}/`);
console.log(`    module.json          (v${version}, URLs already wired to the release pipeline)`);
console.log(`    scripts/${id}.js`);
console.log(`    README.md`);
console.log(`\nNext:`);
console.log(`  1. write the module,`);
console.log(`  2. add it to the Modules section of the repo README,`);
console.log(`  3. commit, then: npm run release -- ${id} 0.1.0\n`);

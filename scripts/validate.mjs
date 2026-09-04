#!/usr/bin/env node
// Checks every module.json in the repo. Run it yourself with `npm run validate`; CI runs it on
// every push and PR so a bad manifest never reaches a release.
import fs from 'node:fs';
import path from 'node:path';
import {
    listModuleIds, moduleDir, manifestPath, readManifest,
    manifestUrl, downloadUrl, projectUrl, isSemver
} from './lib/modules.mjs';

const REQUIRED_KEYS = ['id', 'title', 'description', 'version', 'compatibility'];
const FILE_LIST_KEYS = ['esmodules', 'scripts', 'styles', 'packs', 'languages'];

const problems = [];
const ids = listModuleIds();

function fail(id, message) {
    problems.push(`${id}: ${message}`);
}

if (ids.length === 0) problems.push('modules/: no module directories containing a module.json were found');

for (const id of ids) {
    let manifest;
    try {
        manifest = readManifest(id);
    } catch (err) {
        fail(id, `module.json is not valid JSON — ${err.message}`);
        continue;
    }

    for (const key of REQUIRED_KEYS) {
        if (manifest[key] === undefined || manifest[key] === '') fail(id, `missing required key "${key}"`);
    }

    if (manifest.id !== id) fail(id, `manifest id "${manifest.id}" does not match its folder name "${id}"`);
    if (manifest.version && !isSemver(manifest.version)) fail(id, `version "${manifest.version}" is not semver (x.y.z)`);

    if (!manifest.compatibility?.minimum) fail(id, 'compatibility.minimum is required so Foundry can gate installs');

// Tags and download URLs are derived from these, so they have to match what we'd generate.
    // A hand-edited URL here is the kind of thing you only notice when someone can't install.
    const expectedManifest = manifestUrl(id);
    if (manifest.manifest !== expectedManifest) fail(id, `manifest URL should be ${expectedManifest} (got ${manifest.manifest ?? 'nothing'})`);

    const expectedDownload = downloadUrl(id, manifest.version);
    if (manifest.download !== expectedDownload) {
        fail(id, `download URL should point at the v${manifest.version} release asset:\n      expected ${expectedDownload}\n      got      ${manifest.download ?? 'nothing'}\n      (run "npm run release -- ${id} <patch|minor|major>" instead of editing the version by hand)`);
    }

    if (manifest.url !== projectUrl()) fail(id, `url should be ${projectUrl()} (got ${manifest.url ?? 'nothing'})`);

// If the manifest points at a script that isn't there, Foundry fails at load time with
    // something unhelpful, so catch it now.
    for (const key of FILE_LIST_KEYS) {
        const entries = manifest[key];
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
            const relative = typeof entry === 'string' ? entry : entry.path ?? entry.system;
            if (!relative || typeof relative !== 'string') continue;
            if (!fs.existsSync(path.join(moduleDir(id), relative))) fail(id, `${key} references "${relative}", which does not exist`);
        }
    }

    if (!fs.existsSync(path.join(moduleDir(id), 'README.md'))) {
        console.warn(`  note  ${id}: no README.md in the module folder (optional, but it ends up in the zip)`);
    }
}

if (problems.length > 0) {
    console.error(`\nManifest validation failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    console.error(`\nChecked: ${ids.join(', ') || '(none)'}\n`);
    process.exit(1);
}

console.log(`✓ ${ids.length} module manifest${ids.length === 1 ? '' : 's'} valid: ${ids.join(', ')}`);
for (const id of ids) console.log(`  ${id} @ ${readManifest(id).version} — ${manifestPath(id)}`);

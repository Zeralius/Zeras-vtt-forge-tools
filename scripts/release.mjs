#!/usr/bin/env node
// Releases one module. Bumps the version, fixes up its URLs, refreshes the bundle, commits, tags
// `<id>-v<version>` and pushes. Pushing the tag is the bit that matters: that's what wakes up the
// GitHub Actions workflow that builds the zip and publishes the release.
//
//   npm run release -- hp-in-bar patch
//   npm run release -- hp-in-bar 1.2.0
//   npm run release -- hp-in-bar minor --dry-run
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    REPO_ROOT, listModuleIds, readManifest, writeManifest,
    manifestUrl, downloadUrl, projectUrl, releaseTag, bumpVersion, isSemver, BUNDLE_ID
} from './lib/modules.mjs';

function git(...args) {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function die(message) {
    console.error(`\n✗ ${message}\n`);
    process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [id, bump] = args.filter(arg => !arg.startsWith('--'));

const known = listModuleIds();
if (!id || !bump) {
    die(`usage: npm run release -- <module-id> <patch|minor|major|x.y.z> [--dry-run]\n  known modules: ${known.join(', ') || '(none)'}`);
}
if (!known.includes(id)) die(`unknown module "${id}". Known modules: ${known.join(', ') || '(none)'}`);

// Don't release from a dirty tree. Whatever ships has to be reproducible from what's committed.
if (git('status', '--porcelain')) die('working tree has uncommitted changes. Commit or stash them first.');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') console.warn(`  note  releasing from branch "${branch}" rather than main.`);

const manifest = readManifest(id);
const currentVersion = manifest.version;
const nextVersion = ['patch', 'minor', 'major'].includes(bump) ? bumpVersion(currentVersion, bump) : bump;
if (!isSemver(nextVersion)) die(`"${nextVersion}" is not a valid semver version (x.y.z)`);

const tag = releaseTag(id, nextVersion);
if (git('tag', '--list', tag)) die(`tag ${tag} already exists. Pick a different version.`);

// Regenerate every URL rather than trusting what's in the file, so a manifest someone edited by
// hand can't drift away from the tag we're about to push.
manifest.version = nextVersion;
manifest.url = projectUrl();
manifest.manifest = manifestUrl(id);
manifest.download = downloadUrl(id, nextVersion);

console.log(`\n${manifest.title} (${id})`);
console.log(`  ${currentVersion}  ->  ${nextVersion}`);
console.log(`  tag       ${tag}`);
console.log(`  manifest  ${manifest.manifest}`);
console.log(`  download  ${manifest.download}`);

if (dryRun) {
    console.log('\n--dry-run: nothing was written, committed or pushed.\n');
    process.exit(0);
}

writeManifest(id, manifest);

// The bundle pins a minimum version per module, so it goes stale the moment we bump one.
// Regenerate it here and let it ride along in the same commit.
if (id !== BUNDLE_ID) {
    execFileSync(process.execPath, [fileURLToPath(new URL('./bundle.mjs', import.meta.url))], { cwd: REPO_ROOT, stdio: 'inherit' });
}

git('add', '--all', 'modules');

// Releasing a brand new module at the version it was scaffolded with leaves nothing to commit,
// because the manifest already says the right thing. That's fine, just tag what's already there.
if (git('diff', '--cached', '--name-only')) {
    git('commit', '-m', `${id} ${nextVersion}`);
} else {
    console.log(`\n  (manifest was already correct, tagging the current commit)`);
}

git('tag', '-a', tag, '-m', `${manifest.title} ${nextVersion}`);

console.log(`\nTagged locally. Pushing...`);
git('push', 'origin', branch);
git('push', 'origin', tag);

console.log(`\n✓ Pushed ${tag}. GitHub Actions is now building and publishing the release:`);
console.log(`  ${projectUrl()}/actions`);
console.log(`  ${projectUrl()}/releases/tag/${tag}\n`);

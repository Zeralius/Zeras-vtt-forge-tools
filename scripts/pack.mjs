#!/usr/bin/env node
// Zips a module into dist/<id>.zip with module.json at the root, which is what Foundry expects
// when it unpacks a download.
//
//   npm run pack -- hp-in-bar
//   npm run pack                 all of them
//
// The zip gets written by hand instead of shelling out to `zip` or Compress-Archive. Partly so a
// build on Windows and a build on the CI runner come out identical, partly because PowerShell's
// Compress-Archive has historically written backslashes into paths, which some unzippers choke on.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { REPO_ROOT, listModuleIds, moduleDir, readManifest } from './lib/modules.mjs';

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let crc = -1;
    for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
}

// Repo junk that has no business being in a shipped module.
const EXCLUDED = new Set(['.DS_Store', 'Thumbs.db', '.git', 'node_modules']);

function collectFiles(dir, prefix = '') {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (EXCLUDED.has(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name; // forward slashes, per the zip spec
        if (entry.isDirectory()) files.push(...collectFiles(absolute, relative));
        else if (entry.isFile()) files.push({ absolute, relative });
    }
    return files;
}

function createZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(file.relative, 'utf8');
        const raw = fs.readFileSync(file.absolute);
        const deflated = zlib.deflateRawSync(raw, { level: 9 });
// Sometimes deflate makes a small file bigger. Store it as-is when that happens.
        const useDeflate = deflated.length < raw.length;
        const body = useDeflate ? deflated : raw;
        const method = useDeflate ? 8 : 0;
        const crc = crc32(raw);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034B50, 0);
        local.writeUInt16LE(20, 4);          // version needed
        local.writeUInt16LE(0x0800, 6);      // flags: UTF-8 names
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(0, 10);          // mod time  — fixed, for reproducible archives
        local.writeUInt16LE(0x21, 12);       // mod date  — 1980-01-01
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);          // extra field length
        localParts.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014B50, 0);
        central.writeUInt16LE(20, 4);        // version made by
        central.writeUInt16LE(20, 6);        // version needed
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(0, 38);        // external attributes
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, name);

        offset += local.length + name.length + body.length;
    }

    const central = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054B50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, central, end]);
}

const requested = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const known = listModuleIds();
const targets = requested.length > 0 ? requested : known;

for (const id of targets) {
    if (!known.includes(id)) {
        console.error(`\n✗ unknown module "${id}". Known modules: ${known.join(', ') || '(none)'}\n`);
        process.exit(1);
    }
}

const distDir = path.join(REPO_ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });

for (const id of targets) {
    const files = collectFiles(moduleDir(id));
    if (!files.some(file => file.relative === 'module.json')) {
        console.error(`\n✗ ${id}: module.json must sit at the root of the module folder.\n`);
        process.exit(1);
    }
    const target = path.join(distDir, `${id}.zip`);
    fs.writeFileSync(target, createZip(files));
// The manifest also gets uploaded on its own, so Foundry can check the version without
    // pulling down the whole zip.
    fs.copyFileSync(path.join(moduleDir(id), 'module.json'), path.join(distDir, `${id}.module.json`));
    const { version } = readManifest(id);
    console.log(`✓ ${id} v${version} -> dist/${id}.zip (${files.length} files, ${(fs.statSync(target).size / 1024).toFixed(1)} KB)`);
}

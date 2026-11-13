import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadModule } from './foundry-stub.mjs';
import { listModuleIds, moduleDir, readManifest } from '../scripts/lib/modules.mjs';

const meows = await loadModule('meows-kit');
const flipside = await loadModule('flipside');
const hp = await loadModule('hp-in-bar');

test('meows-kit: a whole grid of 50 or more keeps the scene as it is', () => {
    const fit = meows.fitGrid({ width: 2000, height: 1500, gridSize: 100, gridOffsetX: 7, gridOffsetY: 3 });
    assert.deepEqual(fit, { gridless: false, gridSize: 100, width: 2000, height: 1500, offsetX: -7, offsetY: -3, scale: 1 });
});

test('meows-kit: a small grid scales the scene up instead of only bumping the grid', () => {
    const fit = meows.fitGrid({ width: 1000, height: 800, gridSize: 25, gridOffsetX: 4, gridOffsetY: 2 });
    assert.equal(fit.gridSize, 50);
    assert.equal(fit.width, 2000);
    assert.equal(fit.height, 1600);
    assert.equal(fit.offsetX, -8);
    assert.equal(fit.offsetY, -4);
});

test('meows-kit: a fractional grid scales to the nearest whole pixel', () => {
    const fit = meows.fitGrid({ width: 1407, height: 704, gridSize: 70.35 });
    assert.equal(fit.gridSize, 70);
    // 20 squares across stays 20 squares across.
    assert.equal(fit.width, Math.round(1407 * 70 / 70.35));
    assert.equal(Math.round(fit.width / fit.gridSize), 20);
});

test('meows-kit: gridless maps keep their size', () => {
    const fit = meows.fitGrid({ width: 1200, height: 900, gridless: true, gridSize: 30 });
    assert.equal(fit.gridless, true);
    assert.equal(fit.width, 1200);
    assert.equal(fit.scale, 1);
});

test('meows-kit: placed tokens wrap before the right edge and never leave the scene', () => {
    const fights = [{ groups: [{ token: 'goblin.png', count: 30 }] }];
    const step = 100;
    const sceneWidth = 1000;
    const spots = meows.layoutTokens(fights, { step, sceneWidth });
    assert.equal(spots.length, 30);
    for (const { x } of spots) assert.ok(x + step <= sceneWidth - step, `x=${x} runs off a ${sceneWidth} px scene`);
    assert.ok(new Set(spots.map(s => s.y)).size > 1, 'should have wrapped onto more rows');
});

test('meows-kit: each fight starts a row of its own, and big tokens take their room', () => {
    const fights = [
        { groups: [{ token: 'ogre.png', count: 1 }, { token: 'goblin.png', count: 1 }] },
        { groups: [{ token: 'goblin.png', count: 1 }] }
    ];
    const sizeOf = file => (file === 'ogre.png' ? { width: 2, height: 2 } : { width: 1, height: 1 });
    const spots = meows.layoutTokens(fights, { step: 100, sceneWidth: 2000, sizeOf });
    assert.deepEqual(spots.map(({ x, y }) => [x, y]), [[100, 100], [300, 100], [100, 300]]);
});

test('meows-kit: run sheet page lists who is in the fight and the notes', () => {
    const page = meows.runSheetPage(
        { groups: [{ name: 'Goblin', count: 3 }, { name: 'Boss', count: 1 }], lines: ['Ambush'], notes: ' Run away at half HP. ' },
        'Cellar',
        { onTheMap: 'On the map:' }
    );
    assert.equal(page, '**On the map:** Cellar\n\n- 3 × **Goblin**\n- **Boss**\n- Ambush\n\nRun away at half HP.');
});

test('meows-kit: actor type prefers a monster type, skips base', () => {
    assert.equal(meows.firstActorType(['base', 'character', 'npc', 'vehicle']), 'npc');
    assert.equal(meows.firstActorType(['base', 'hero']), 'hero');
    assert.equal(meows.firstActorType(['base']), null);
});

test('meows-kit: sides become dispositions', () => {
    assert.equal(meows.dispositionOf('friend'), 1);
    assert.equal(meows.dispositionOf('Boss'), -1);
    assert.equal(meows.dispositionOf('neutral'), 0);
    assert.equal(meows.dispositionOf(undefined), -2);
});

test('meows-kit: only paths in the old kits folder move, and keep their place under the new root', () => {
    const root = 'worlds/campaign/meows-kits';
    assert.equal(meows.relocatedPath('modules/meows-kit/kits/cellar/map 1.webp', root), `${root}/cellar/map 1.webp`);
    assert.equal(meows.relocatedPath('modules/meows-kit/kitsch/x.png', root), null);
    assert.equal(meows.relocatedPath('worlds/campaign/x.png', root), null);
    assert.equal(meows.relocatedPath(undefined, root), null);
});

test('flipside: faces parse one per line, ignoring blanks', () => {
    assert.deepEqual(flipside.parseFaces(' a.png \n\n b.png\r\n'), ['a.png', 'b.png']);
    assert.deepEqual(flipside.parseFaces(undefined), []);
    assert.deepEqual(flipside.parseFaces(['a.png']), []);
});

test('flipside: picking the next face', () => {
    const faces = ['a', 'b', 'c'];
    assert.equal(flipside.pickFace(faces, 'a', 1, true), 'b');
    assert.equal(flipside.pickFace(faces, 'c', 1, true), 'a');
    assert.equal(flipside.pickFace(faces, 'a', -1, true), 'c');
    assert.equal(flipside.pickFace(faces, 'c', 1, false), null);
    assert.equal(flipside.pickFace(faces, 'a', -1, false), null);
    assert.equal(flipside.pickFace(faces, 'elsewhere', 1, true), 'a');
    assert.equal(flipside.pickFace(['a'], 'a', 1, true), null);
});

test('hp-in-bar: only the dnd5e HP bar gets numbers', () => {
    assert.equal(hp.isHPBar({ type: 'bar', attribute: 'attributes.hp', value: 4, max: 10 }), true);
    assert.equal(hp.isHPBar({ type: 'bar', attribute: 'resources.hpotions', value: 1, max: 3 }), false);
    assert.equal(hp.isHPBar({ type: 'bar', attribute: 'attributes.hp', value: 0, max: 0 }), false);
    assert.equal(hp.isHPBar({ type: 'value', attribute: 'attributes.hp', value: 4 }), false);
    assert.equal(hp.isHPBar(null), false);
});

test('hp-in-bar: who sees the numbers', () => {
    const player = { isGM: false, isOwner: false };
    const owner = { isGM: false, isOwner: true };
    const gm = { isGM: true, isOwner: true };
    assert.deepEqual(['owner', 'everyone', 'gm'].map(v => hp.numbersVisible(v, player)), [false, true, false]);
    assert.deepEqual(['owner', 'everyone', 'gm'].map(v => hp.numbersVisible(v, owner)), [true, true, false]);
    assert.deepEqual(['owner', 'everyone', 'gm'].map(v => hp.numbersVisible(v, gm)), [true, true, true]);
});

test('hp-in-bar: AC visibility can be turned off', () => {
    assert.equal(hp.numbersVisible('off', { isGM: true, isOwner: true }), false);
});

test('hp-in-bar: AC edits become an adjustment, never an overwrite', () => {
    const plain = { value: 15, adjustment: 0, override: null };
    assert.deepEqual(hp.planAcEdit('+2', plain), { action: 'adjust', adjustment: 2 });
    assert.deepEqual(hp.planAcEdit(' - 3 ', plain), { action: 'adjust', adjustment: -3 });
    assert.deepEqual(hp.planAcEdit('17', plain), { action: 'adjust', adjustment: 2 });
    assert.deepEqual(hp.planAcEdit('15', plain), { action: 'none' });
    assert.deepEqual(hp.planAcEdit('', plain), { action: 'none' });
    assert.deepEqual(hp.planAcEdit('abc', plain), { action: 'none' });

    // Shield is on: 15 calculated + 5 shows as 20.
    const shielded = { value: 20, adjustment: 5, override: null };
    assert.deepEqual(hp.planAcEdit('+2', shielded), { action: 'adjust', adjustment: 7 });
    assert.deepEqual(hp.planAcEdit('-5', shielded), { action: 'clear' });
    assert.deepEqual(hp.planAcEdit('15', shielded), { action: 'clear' });
    assert.deepEqual(hp.planAcEdit('18', shielded), { action: 'adjust', adjustment: 3 });
    for (const reset of ['0', '', '=']) assert.deepEqual(hp.planAcEdit(reset, shielded), { action: 'clear' });
});

test('hp-in-bar: with a manual override, AC edits change the override', () => {
    const fixed = { value: 14, adjustment: 0, override: 14 };
    assert.deepEqual(hp.planAcEdit('+2', fixed), { action: 'override', override: 16 });
    assert.deepEqual(hp.planAcEdit('18', fixed), { action: 'override', override: 18 });
    assert.deepEqual(hp.planAcEdit('-20', fixed), { action: 'override', override: 0 });
    assert.deepEqual(hp.planAcEdit('14', fixed), { action: 'none' });
});

test('hp-in-bar: the adjustment effect has the shape each core generation expects', () => {
    const v14 = hp.adjustmentEffectData(3, { generation: 14, name: 'AC adjustment', addMode: 2 });
    assert.deepEqual(v14.system.changes, [{ key: 'system.attributes.ac.bonus', type: 'add', value: 3 }]);
    assert.equal(v14.changes, undefined);
    assert.equal(v14.flags['hp-in-bar'].acAdjustment, true);

    const v13 = hp.adjustmentEffectData(-2, { generation: 13, name: 'AC adjustment', addMode: 2 });
    assert.deepEqual(v13.changes, [{ key: 'system.attributes.ac.bonus', mode: 2, value: '-2' }]);
    assert.equal(v13.system, undefined);
});

test('hp-in-bar: the adjustment is read from the effect, so sheet edits count', () => {
    const change = value => [{ key: 'system.attributes.ac.bonus', value }];
    assert.equal(hp.adjustmentOf({ system: { changes: change(4) } }), 4);
    assert.equal(hp.adjustmentOf({ changes: change('-1') }), -1);
    assert.equal(hp.adjustmentOf({ disabled: true, system: { changes: change(4) } }), 0);
    assert.equal(hp.adjustmentOf({ system: { changes: change('1d4') } }), 0);
});

// Every string key a script uses has to be in every language file it ships, or players see the
// raw key.
for (const id of listModuleIds({ includeBundle: false })) {
    const manifest = readManifest(id);
    if (!manifest.languages?.length) continue;
    test(`${id}: every language file has every key the scripts use`, () => {
        const used = new Set();
        for (const script of manifest.esmodules ?? []) {
            const source = fs.readFileSync(path.join(moduleDir(id), script), 'utf8');
            for (const [, key] of source.matchAll(/['"`]([A-Z][A-Z0-9]+\.[A-Za-z0-9]+)['"`]/g)) used.add(key);
        }
        assert.ok(used.size > 0, 'expected the scripts to use some translated strings');
        for (const language of manifest.languages) {
            const strings = JSON.parse(fs.readFileSync(path.join(moduleDir(id), language.path), 'utf8'));
            const missing = [...used].filter(key => !(key in strings));
            assert.deepEqual(missing, [], `${language.path} is missing keys`);
        }
    });
}

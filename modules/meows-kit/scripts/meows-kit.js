// Meows Kit: imports a one-shot kit written by Meows' Familiar tab.
//
// A kit is a folder somewhere under Data with a kit.json in it and the pictures beside it. Meows
// has already done the work that needs a desktop: the maps are fitted and framed, the tokens cut
// round, the grid worked out or deliberately switched off. This module does the part that needs
// Foundry: a Folder named after the kit, one Scene per map, one JournalEntry per handout and per
// note, one Actor per token, and the run sheet as a journal entry per scene with the fights on
// it, the tokens placed hidden on the map. Five maps in the kit, five scenes in the folder, in
// order.
//
// Nothing here talks to Meows. The folder is the whole interface, which is why it is a kit.json
// and not a socket: it can be uploaded through Foundry's own file picker, dropped on the server
// by hand, or written there by Meows once it can reach the server.

const MODULE_ID = 'meows-kit';
const KIT_VERSION = 1;

// Where 0.1.0 and 0.2.0 sent kits. Foundry replaces a module's folder when it updates the module,
// so anything uploaded in here is deleted by the next update. Kits go in the world now, and the
// ones still in here get moved out on the next start.
const OLD_KITS_ROOT = 'modules/meows-kit/kits';

// Foundry will not take a square grid smaller than this.
const MIN_GRID_SIZE = 50;

Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'lastFolder', {
        name: 'Last kit folder',
        scope: 'world',
        config: false,
        type: String,
        default: ''
    });
    game.settings.register(MODULE_ID, 'makeActors', {
        name: 'MEOWSKIT.MakeActors',
        hint: 'MEOWSKIT.MakeActorsHint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register(MODULE_ID, 'placeTokens', {
        name: 'MEOWSKIT.PlaceTokens',
        hint: 'MEOWSKIT.PlaceTokensHint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.registerMenu(MODULE_ID, 'import', {
        name: 'MEOWSKIT.Import',
        label: 'MEOWSKIT.ImportLabel',
        hint: 'MEOWSKIT.ImportHint',
        icon: 'fas fa-basket-shopping',
        type: ImportKitMenu,
        restricted: true
    });
});

// A button at the top of the Scenes sidebar, where a GM looking for a way to bring maps in
// would look first. The hook hands a jQuery object on v12 and an element on v13+, so both are
// taken.
Hooks.on('renderSceneDirectory', (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root || root.querySelector(`.${MODULE_ID}-import`)) return;
    const header = root.querySelector('.directory-header .action-buttons') ?? root.querySelector('.directory-header');
    if (!header) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${MODULE_ID}-import`;
    button.innerHTML = `<i class="fas fa-basket-shopping"></i> ${game.i18n.localize('MEOWSKIT.ImportLabel')}`;
    button.addEventListener('click', () => pickAndImport());
    header.appendChild(button);
});

/** The settings-menu shape Foundry wants: something with render(). It just opens the picker. */
class ImportKitMenu extends foundry.applications.api.ApplicationV2 {
    async render() {
        pickAndImport();
        return this;
    }
}

function filePicker() {
    return foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
}

/** Where kits live: in the world, so they travel with it and no module update touches them. */
function kitsRoot() {
    return `worlds/${game.world.id}/meows-kits`;
}

/** Makes every folder along the path that is not there yet. */
async function ensureDirectory(path) {
    const Picker = filePicker();
    let current = '';
    for (const segment of path.split('/').filter(Boolean)) {
        current = current ? `${current}/${segment}` : segment;
        try {
            await Picker.browse('data', current);
        } catch {
            await Picker.createDirectory('data', current);
        }
    }
}

/** Foundry's own folder picker, starting where the last kit was, then the import. */
async function pickAndImport() {
    let start = game.settings.get(MODULE_ID, 'lastFolder');
    if (!start || start.startsWith(OLD_KITS_ROOT)) {
        start = kitsRoot();
        try {
            await ensureDirectory(start);
        } catch (error) {
            console.warn(`${MODULE_ID} | could not make ${start}`, error);
        }
    }
    const Picker = filePicker();
    const picker = new Picker({
        type: 'folder',
        current: start,
        callback: async (folder) => {
            await game.settings.set(MODULE_ID, 'lastFolder', folder);
            await importKit(folder);
        }
    });
    picker.render(true);
}

/**
 * Reads kit.json from the folder and builds everything it describes.
 *
 * `ifExists` decides what happens when the kit was imported before: 'ask' (the default) asks the
 * GM, 'skip' does nothing, 'again' makes a second set anyway.
 */
export async function importKit(folder, { ifExists = 'ask' } = {}) {
    const base = folder.replace(/\/+$/, '');
    let kit;
    try {
        const response = await fetch(`${base}/kit.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        kit = await response.json();
    } catch (error) {
        ui.notifications.error(game.i18n.format('MEOWSKIT.NoManifest', { folder: base, error: error.message }));
        return null;
    }

    if (kit.meowsKit !== KIT_VERSION) {
        ui.notifications.error(game.i18n.format('MEOWSKIT.WrongVersion', { found: String(kit.meowsKit), wanted: String(KIT_VERSION) }));
        return null;
    }

    const title = kit.title || base.split('/').pop();

    if (ifExists !== 'again' && alreadyImported(base)) {
        if (ifExists === 'skip') return null;
        const again = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize('MEOWSKIT.AlreadyImportedTitle') },
            content: `<p>${game.i18n.format('MEOWSKIT.AlreadyImported', { title: foundry.utils.escapeHTML(title) })}</p>`
        });
        if (!again) return null;
    }

    const made = { scenes: 0, journals: 0, actors: 0, tokens: 0 };
    const scenes = new Map();   // map file -> Scene
    const actors = new Map();   // token file -> Actor
    const folderData = type => ({ name: title, type, color: '#6b4e2a', flags: { [MODULE_ID]: { kit: base } } });

    // One folder per document type, all named after the kit, since Foundry folders are per type.
    const sceneFolder = kit.scenes?.length ? await Folder.create(folderData('Scene')) : null;

    for (const map of kit.scenes ?? []) {
        const fit = fitGrid(map);
        if (fit.scale !== 1) console.log(`${MODULE_ID} | ${map.name}: scaled by ${fit.scale.toFixed(3)} so the grid is a whole ${fit.gridSize} px`);
        const data = {
            name: map.name,
            folder: sceneFolder?.id,
            width: fit.width,
            height: fit.height,
            padding: 0,
            background: {
                src: `${base}/${map.file}`,
                // The grid starts at the scene's origin; the map's own lines start a few pixels
                // in. Moving the picture back by that much puts the two on top of each other.
                offsetX: fit.offsetX,
                offsetY: fit.offsetY
            },
            grid: {
                type: fit.gridless ? CONST.GRID_TYPES.GRIDLESS : CONST.GRID_TYPES.SQUARE,
                size: fit.gridSize
            },
            navigation: false,
            navName: map.name
        };
        if (map.caption) data.flags = { [MODULE_ID]: { caption: map.caption } };
        try {
            const scene = await Scene.create(data);
            scenes.set(map.file, scene);
            made.scenes++;
        } catch (error) {
            console.error(`${MODULE_ID} | scene ${map.name}`, error);
            ui.notifications.warn(game.i18n.format('MEOWSKIT.SceneFailed', { name: map.name, error: error.message }));
        }
    }

    const journalItems = (kit.handouts?.length ?? 0) + (kit.notes?.length ?? 0) + (kit.encounters?.length ?? 0);
    const journalFolder = journalItems ? await Folder.create(folderData('JournalEntry')) : null;

    for (const handout of kit.handouts ?? []) {
        try {
            await JournalEntry.create({
                name: handout.name,
                folder: journalFolder?.id,
                pages: [{
                    name: handout.name,
                    type: 'image',
                    src: `${base}/${handout.file}`,
                    image: { caption: handout.caption || '' }
                }]
            });
            made.journals++;
        } catch (error) {
            console.error(`${MODULE_ID} | handout ${handout.name}`, error);
        }
    }

    for (const note of kit.notes ?? []) {
        try {
            const response = await fetch(`${base}/${note}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const markdown = await response.text();
            const name = note.split('/').pop().replace(/\.md$/i, '');
            await JournalEntry.create({
                name,
                folder: journalFolder?.id,
                pages: [markdownPage(name, markdown)]
            });
            made.journals++;
        } catch (error) {
            console.error(`${MODULE_ID} | note ${note}`, error);
            ui.notifications.warn(game.i18n.format('MEOWSKIT.NoteFailed', { note, error: error.message }));
        }
    }

    if (game.settings.get(MODULE_ID, 'makeActors') && kit.tokens?.length) {
        const type = firstActorType(game.documentTypes?.Actor ?? Object.keys(CONFIG.Actor.dataModels ?? {}));
        if (type) {
            const actorFolder = await Folder.create(folderData('Actor'));
            for (const token of kit.tokens) {
                try {
                    const src = `${base}/${token.file}`;
                    const actor = await Actor.create({
                        name: token.name,
                        type,
                        folder: actorFolder.id,
                        img: src,
                        prototypeToken: {
                            name: token.name,
                            texture: { src },
                            disposition: dispositionOf(token.side)
                        }
                    });
                    actors.set(token.file, actor);
                    made.actors++;
                } catch (error) {
                    console.error(`${MODULE_ID} | token ${token.name}`, error);
                }
            }
        } else {
            ui.notifications.warn(game.i18n.localize('MEOWSKIT.NoActorType'));
        }
    }

    // The run sheet: one journal entry per scene that has fights on it, a page per fight,
    // linked from the scene so the notes button on the scene opens it; fights on no map go in
    // an entry named after the kit. The tokens are placed hidden in rows along the top, a row
    // per fight, so the GM drags them where they go and reveals them when the fight starts.
    if (kit.encounters?.length) {
        const bySceneFile = new Map();
        for (const encounter of kit.encounters) {
            const key = scenes.has(encounter.map) ? encounter.map : '';
            if (!bySceneFile.has(key)) bySceneFile.set(key, []);
            bySceneFile.get(key).push(encounter);
        }
        const tokenByFile = new Map((kit.tokens ?? []).map(t => [t.file, t]));
        const labels = {
            onTheMap: game.i18n.localize('MEOWSKIT.OnTheMap'),
            unnamed: game.i18n.localize('MEOWSKIT.UnnamedFight')
        };

        for (const [file, fights] of bySceneFile) {
            const scene = file ? scenes.get(file) : null;
            const name = scene ? game.i18n.format('MEOWSKIT.RunSheetFor', { scene: scene.name }) : game.i18n.format('MEOWSKIT.RunSheet', { title });
            const pages = fights.map(f => markdownPage(f.name || labels.unnamed, runSheetPage(f, scene?.name, labels)));
            try {
                const entry = await JournalEntry.create({ name, folder: journalFolder?.id, pages });
                made.journals++;
                if (scene) await scene.update({ journal: entry.id });
            } catch (error) {
                console.error(`${MODULE_ID} | run sheet ${name}`, error);
            }

            if (!scene || !game.settings.get(MODULE_ID, 'placeTokens')) continue;

            // A token's footprint in grid squares: its actor's prototype size where there is an
            // actor, one square otherwise.
            const sizeOf = tokenFile => {
                const prototype = actors.get(tokenFile)?.prototypeToken;
                return { width: prototype?.width || 1, height: prototype?.height || 1 };
            };
            const spots = layoutTokens(fights, { step: scene.grid.size, sceneWidth: scene.width, sizeOf });

            const placed = [];
            for (const { group, x, y } of spots) {
                const actor = actors.get(group.token);
                if (actor) {
                    const doc = await actor.getTokenDocument({ x, y, hidden: true });
                    placed.push(doc.toObject());
                } else {
                    placed.push({
                        name: group.name,
                        x, y, hidden: true,
                        texture: { src: `${base}/${group.token}` },
                        disposition: dispositionOf(tokenByFile.get(group.token)?.side)
                    });
                }
            }
            if (placed.length) {
                try {
                    await scene.createEmbeddedDocuments('Token', placed);
                    made.tokens += placed.length;
                } catch (error) {
                    console.error(`${MODULE_ID} | tokens on ${scene.name}`, error);
                    ui.notifications.warn(game.i18n.format('MEOWSKIT.TokensFailed', { name: scene.name, error: error.message }));
                }
            }
        }
    }

    ui.notifications.info(game.i18n.format('MEOWSKIT.Done', { title, ...made }));
    console.log(`${MODULE_ID} | imported "${title}" from ${base}:`, made);
    return made;
}

/** Whether anything in the world already points into this kit's folder. */
function alreadyImported(base) {
    const prefix = `${base}/`;
    const inKit = src => typeof src === 'string' && src.startsWith(prefix);
    return game.folders.some(f => f.getFlag(MODULE_ID, 'kit') === base)
        || game.scenes.some(s => inKit(s.background?.src))
        || game.actors.some(a => inKit(a.img))
        || game.journal.some(j => j.pages.some(p => inKit(p.src)));
}

/** A text page holding markdown: the source in `markdown`, the HTML Foundry shows in `content`. */
function markdownPage(name, markdown) {
    return {
        name,
        type: 'text',
        text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN, markdown, content: markdownToHTML(markdown) }
    };
}

function markdownToHTML(markdown) {
    const converter = globalThis.showdown
        ? new globalThis.showdown.Converter({ ...CONST.SHOWDOWN_OPTIONS })
        : foundry.applications.sheets.journal.JournalEntryPageTextSheet?._converter;
    return converter ? converter.makeHtml(markdown) : `<pre>${foundry.utils.escapeHTML(markdown)}</pre>`;
}

/**
 * The scene's size and grid for one map. Foundry wants a whole-pixel grid of at least 50, and
 * the grid Meows measures is rarely either, so the scene is scaled until it is. The background
 * stretches to the scene, so the map scales with it and its lines stay under the grid.
 */
export function fitGrid(map, minimum = MIN_GRID_SIZE) {
    if (map.gridless) {
        return { gridless: true, gridSize: 100, width: map.width, height: map.height, offsetX: 0, offsetY: 0, scale: 1 };
    }
    const measured = map.gridSize > 0 ? map.gridSize : 100;
    const gridSize = Math.max(minimum, Math.round(measured));
    const scale = gridSize / measured;
    return {
        gridless: false,
        gridSize,
        width: Math.round(map.width * scale),
        height: Math.round(map.height * scale),
        offsetX: -Math.round((map.gridOffsetX || 0) * scale),
        offsetY: -Math.round((map.gridOffsetY || 0) * scale),
        scale
    };
}

/**
 * Where each fight's tokens go: a row per fight along the top, one square in from the edge,
 * wrapping before the scene's right edge, with big tokens taking the room they need.
 */
export function layoutTokens(fights, { step, sceneWidth, sizeOf = () => ({ width: 1, height: 1 }) }) {
    const spots = [];
    const right = Math.max(sceneWidth - step, step * 2);
    let y = step;
    for (const fight of fights) {
        let x = step;
        let rowHeight = 0;
        for (const group of fight.groups ?? []) {
            const { width, height } = sizeOf(group.token);
            for (let i = 0; i < (group.count || 1); i++) {
                if (x > step && x + width * step > right) {
                    x = step;
                    y += rowHeight;
                    rowHeight = 0;
                }
                spots.push({ group, x, y });
                x += width * step;
                rowHeight = Math.max(rowHeight, height * step);
            }
        }
        if (rowHeight) y += rowHeight;
    }
    return spots;
}

/** One fight as markdown: where, who, and what the GM wrote. */
export function runSheetPage(fight, sceneName, labels) {
    const lines = [];
    if (sceneName) lines.push(`**${labels.onTheMap}** ${sceneName}`, '');
    for (const group of fight.groups ?? []) lines.push(`- ${group.count > 1 ? `${group.count} × ` : ''}**${group.name}**`);
    for (const line of fight.lines ?? []) lines.push(`- ${line}`);
    if ((fight.groups?.length || fight.lines?.length) && fight.notes) lines.push('');
    if (fight.notes) lines.push(fight.notes.trim());
    return lines.join('\n');
}

/** A system's first actor type that is not a base type, or null when the system has none. */
export function firstActorType(types) {
    const usable = types.filter(t => t !== 'base');
    // Prefer the type a monster would be, where the system names one.
    return usable.find(t => /npc|monster|creature/i.test(t)) ?? usable[0] ?? null;
}

/** The kit's word for a side, as the disposition a token carries. */
export function dispositionOf(side) {
    const D = CONST.TOKEN_DISPOSITIONS;
    switch ((side || '').toLowerCase()) {
        case 'friend': return D.FRIENDLY;
        case 'foe':
        case 'boss': return D.HOSTILE;
        case 'neutral': return D.NEUTRAL;
        default: return D.SECRET ?? D.HOSTILE;
    }
}

/** The new home of a path inside the old kits folder, or null for anything else. */
export function relocatedPath(src, newRoot) {
    if (typeof src !== 'string' || !src.startsWith(`${OLD_KITS_ROOT}/`)) return null;
    return `${newRoot}${src.slice(OLD_KITS_ROOT.length)}`;
}

/**
 * Moves kits imported by 0.1.0 and 0.2.0 out of the module folder, before a module update deletes
 * them: copies every picture the world uses from there into the world's kits folder, then points
 * the scenes, tokens, actors and journal pages at the copies. The originals are left alone.
 */
async function relocateOldKits() {
    const root = kitsRoot();
    const move = src => relocatedPath(src, root);

    const sceneUpdates = [];
    const tokenUpdates = new Map();   // scene -> token updates
    const actorUpdates = [];
    const pageUpdates = new Map();    // journal entry -> page updates
    const files = new Set();
    const note = src => { files.add(src); return move(src); };

    for (const scene of game.scenes) {
        if (move(scene.background?.src)) sceneUpdates.push({ _id: scene.id, 'background.src': note(scene.background.src) });
        const tokens = scene.tokens.filter(t => move(t.texture?.src))
            .map(t => ({ _id: t.id, 'texture.src': note(t.texture.src) }));
        if (tokens.length) tokenUpdates.set(scene, tokens);
    }
    for (const actor of game.actors) {
        const update = { _id: actor.id };
        if (move(actor.img)) update.img = note(actor.img);
        if (move(actor.prototypeToken?.texture?.src)) update['prototypeToken.texture.src'] = note(actor.prototypeToken.texture.src);
        if (Object.keys(update).length > 1) actorUpdates.push(update);
    }
    for (const entry of game.journal) {
        const pages = entry.pages.filter(p => move(p.src)).map(p => ({ _id: p.id, src: note(p.src) }));
        if (pages.length) pageUpdates.set(entry, pages);
    }

    if (!files.size) return;

    const go = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('MEOWSKIT.RelocateTitle') },
        content: `<p>${game.i18n.format('MEOWSKIT.Relocate', { count: files.size, from: OLD_KITS_ROOT, to: root })}</p>`
    });
    if (!go) return;

    const Picker = filePicker();
    const missing = new Set();
    for (const src of files) {
        try {
            const response = await fetch(src, { cache: 'no-store' });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const target = move(src);
            const directory = target.slice(0, target.lastIndexOf('/'));
            const name = target.slice(target.lastIndexOf('/') + 1);
            await ensureDirectory(directory);
            await Picker.upload('data', directory, new File([await response.blob()], name), {}, { notify: false });
        } catch (error) {
            console.error(`${MODULE_ID} | could not copy ${src}`, error);
            missing.add(src);
        }
    }

    // Only repoint what actually got copied; anything else keeps its old path.
    const copied = update => !Object.entries(update).some(([key, value]) => key !== '_id' && [...missing].some(src => move(src) === value));
    await Scene.updateDocuments(sceneUpdates.filter(copied));
    for (const [scene, updates] of tokenUpdates) await scene.updateEmbeddedDocuments('Token', updates.filter(copied));
    await Actor.updateDocuments(actorUpdates.filter(copied));
    for (const [entry, updates] of pageUpdates) await entry.updateEmbeddedDocuments('JournalEntryPage', updates.filter(copied));

    const last = game.settings.get(MODULE_ID, 'lastFolder');
    if (last.startsWith(OLD_KITS_ROOT)) await game.settings.set(MODULE_ID, 'lastFolder', move(last) ?? root);

    if (missing.size) ui.notifications.warn(game.i18n.format('MEOWSKIT.RelocatePartial', { count: missing.size }));
    else ui.notifications.info(game.i18n.format('MEOWSKIT.Relocated', { count: files.size, to: root }));
}

Hooks.once('ready', () => {
    game.modules.get(MODULE_ID).api = { importKit };
    console.log(`${MODULE_ID} | ready`);
    if (game.user.isGM && game.users.activeGM?.isSelf) {
        relocateOldKits().catch(error => console.error(`${MODULE_ID} | moving old kits`, error));
    }
});

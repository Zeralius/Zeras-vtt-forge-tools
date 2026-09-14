// Meows Kit: imports a one-shot kit written by Meows' Kit tab.
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

Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'lastFolder', {
        name: 'Last kit folder',
        scope: 'world',
        config: false,
        type: String,
        default: 'modules/meows-kit/kits'
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
class ImportKitMenu extends FormApplication {
    render() {
        pickAndImport();
        return this;
    }
}

/** Foundry's own folder picker, starting where the last kit was, then the import. */
async function pickAndImport() {
    const start = game.settings.get(MODULE_ID, 'lastFolder');
    const Picker = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
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

/** Reads kit.json from the folder and builds everything it describes. */
export async function importKit(folder) {
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
    const made = { scenes: 0, journals: 0, actors: 0, tokens: 0 };
    const scenes = new Map();   // map file -> Scene
    const actors = new Map();   // token file -> Actor

    // One folder per document type, all named after the kit, since Foundry folders are per type.
    const sceneFolder = kit.scenes?.length ? await Folder.create({ name: title, type: 'Scene', color: '#6b4e2a' }) : null;

    for (const map of kit.scenes ?? []) {
        const gridless = !!map.gridless;
        const gridSize = gridless ? 100 : Math.max(50, Math.round(map.gridSize || 100));
        const data = {
            name: map.name,
            folder: sceneFolder?.id,
            width: map.width,
            height: map.height,
            padding: 0,
            background: {
                src: `${base}/${map.file}`,
                // The grid starts at the scene's origin; the map's own lines start a few pixels
                // in. Moving the picture back by that much puts the two on top of each other.
                offsetX: gridless ? 0 : -(map.gridOffsetX || 0),
                offsetY: gridless ? 0 : -(map.gridOffsetY || 0)
            },
            grid: {
                type: gridless ? CONST.GRID_TYPES.GRIDLESS : CONST.GRID_TYPES.SQUARE,
                size: gridSize
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
    const journalFolder = journalItems ? await Folder.create({ name: title, type: 'JournalEntry', color: '#6b4e2a' }) : null;

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
            if (!response.ok) continue;
            const markdown = await response.text();
            const name = note.split('/').pop().replace(/\.md$/i, '');
            await JournalEntry.create({
                name,
                folder: journalFolder?.id,
                pages: [{ name, type: 'text', text: { content: markdown, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN } }]
            });
            made.journals++;
        } catch (error) {
            console.error(`${MODULE_ID} | note ${note}`, error);
        }
    }

    if (game.settings.get(MODULE_ID, 'makeActors') && kit.tokens?.length) {
        const type = firstActorType();
        if (type) {
            const actorFolder = await Folder.create({ name: title, type: 'Actor', color: '#6b4e2a' });
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
    // an entry named after the kit. The tokens are placed hidden in a row at the top-left, so
    // the GM drags them where they go and reveals them when the fight starts.
    if (kit.encounters?.length) {
        const bySceneFile = new Map();
        for (const encounter of kit.encounters) {
            const key = scenes.has(encounter.map) ? encounter.map : '';
            if (!bySceneFile.has(key)) bySceneFile.set(key, []);
            bySceneFile.get(key).push(encounter);
        }
        const tokenByFile = new Map((kit.tokens ?? []).map(t => [t.file, t]));

        for (const [file, fights] of bySceneFile) {
            const scene = file ? scenes.get(file) : null;
            const name = scene ? game.i18n.format('MEOWSKIT.RunSheetFor', { scene: scene.name }) : game.i18n.format('MEOWSKIT.RunSheet', { title });
            const pages = fights.map(f => ({
                name: f.name || game.i18n.localize('MEOWSKIT.UnnamedFight'),
                type: 'text',
                text: { content: runSheetPage(f, scene), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN }
            }));
            try {
                const entry = await JournalEntry.create({ name, folder: journalFolder?.id, pages });
                made.journals++;
                if (scene) await scene.update({ journal: entry.id });
            } catch (error) {
                console.error(`${MODULE_ID} | run sheet ${name}`, error);
            }

            if (!scene || !game.settings.get(MODULE_ID, 'placeTokens')) continue;
            const placed = [];
            const step = scene.grid.size;
            let column = 0;
            for (const fight of fights) {
                for (const group of fight.groups ?? []) {
                    const token = tokenByFile.get(group.token);
                    for (let i = 0; i < (group.count || 1); i++) {
                        const x = step + column * step;
                        const y = step;
                        column++;
                        const actor = actors.get(group.token);
                        if (actor) {
                            const doc = await actor.getTokenDocument({ x, y, hidden: true });
                            placed.push(doc.toObject());
                        } else {
                            placed.push({
                                name: group.name,
                                x, y, hidden: true,
                                texture: { src: `${base}/${group.token}` },
                                disposition: dispositionOf(token?.side)
                            });
                        }
                    }
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

/** One fight as a markdown page: where, who, and what the GM wrote. */
function runSheetPage(fight, scene) {
    const lines = [];
    if (scene) lines.push(`**${game.i18n.localize('MEOWSKIT.OnTheMap')}** ${scene.name}`, '');
    for (const group of fight.groups ?? []) lines.push(`- ${group.count > 1 ? `${group.count} × ` : ''}**${group.name}**`);
    for (const line of fight.lines ?? []) lines.push(`- ${line}`);
    if ((fight.groups?.length || fight.lines?.length) && fight.notes) lines.push('');
    if (fight.notes) lines.push(fight.notes.trim());
    return lines.join('\n');
}

/** A system's first actor type that is not a base type, or null when the system has none. */
function firstActorType() {
    const types = game.documentTypes?.Actor ?? Object.keys(CONFIG.Actor.dataModels ?? {});
    const usable = types.filter(t => t !== 'base');
    // Prefer the type a monster would be, where the system names one.
    return usable.find(t => /npc|monster|creature/i.test(t)) ?? usable[0] ?? null;
}

/** The kit's word for a side, as the disposition a token carries. */
function dispositionOf(side) {
    const D = CONST.TOKEN_DISPOSITIONS;
    switch ((side || '').toLowerCase()) {
        case 'friend': return D.FRIENDLY;
        case 'foe':
        case 'boss': return D.HOSTILE;
        case 'neutral': return D.NEUTRAL;
        default: return D.SECRET ?? D.HOSTILE;
    }
}

Hooks.once('ready', () => {
    game.modules.get(MODULE_ID).api = { importKit };
    console.log(`${MODULE_ID} | ready`);
});

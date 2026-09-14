// Meows Kit: imports a one-shot kit written by Meows' Kit tab.
//
// A kit is a folder somewhere under Data with a kit.json in it and the pictures beside it. Meows
// has already done the work that needs a desktop: the maps are fitted and framed, the tokens cut
// round, the grid worked out or deliberately switched off. This module does the part that needs
// Foundry: a Folder named after the kit, one Scene per map, one JournalEntry per handout and per
// note, one Actor per token. Five maps in the kit, five scenes in the folder, in order.
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
    const made = { scenes: 0, journals: 0, actors: 0 };

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
            await Scene.create(data);
            made.scenes++;
        } catch (error) {
            console.error(`${MODULE_ID} | scene ${map.name}`, error);
            ui.notifications.warn(game.i18n.format('MEOWSKIT.SceneFailed', { name: map.name, error: error.message }));
        }
    }

    const journalItems = (kit.handouts?.length ?? 0) + (kit.notes?.length ?? 0);
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
                    await Actor.create({
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
                    made.actors++;
                } catch (error) {
                    console.error(`${MODULE_ID} | token ${token.name}`, error);
                }
            }
        } else {
            ui.notifications.warn(game.i18n.localize('MEOWSKIT.NoActorType'));
        }
    }

    ui.notifications.info(game.i18n.format('MEOWSKIT.Done', { title, ...made }));
    console.log(`${MODULE_ID} | imported "${title}" from ${base}:`, made);
    return made;
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

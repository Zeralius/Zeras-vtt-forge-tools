// Just enough of Foundry's globals for the module scripts to load in Node. The scripts register
// hooks and settings when they load; none of that runs here, only the plain functions they export.
globalThis.Hooks = { on() {}, once() {} };
globalThis.CONST = {
    TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 },
    TOKEN_DISPLAY_MODES: { NONE: 0 },
    GRID_TYPES: { GRIDLESS: 0, SQUARE: 1 },
    JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1, MARKDOWN: 2 }
};
globalThis.foundry = {
    applications: { api: { ApplicationV2: class {} } }
};

/** Imports a module's script by id, with the stub in place. */
export function loadModule(id) {
    return import(new URL(`../modules/${id}/scripts/${id}.js`, import.meta.url));
}

const MODULE_ID = 'dice-ledger';

// Everything recorded lives in one world setting: the sessions, each with its counts, and which
// one is running. Counts, not single rolls, so a campaign of years stays a few kilobytes.
//
// {
//   version: 1,
//   active: 'session id' | null,
//   names: { userId: 'name when last seen' },   // so a deleted user still has a name
//   sessions: [{ id, name, started, ended, public: Tally, private: Tally, blind: Tally }]
// }
//
// public: rolled in the open. private: whispered or self, seen by the roller and the GM.
// blind: blind rolls, whose result even the roller doesn't see, so only the GM's.
// Tally: { userId: { faces: { rolled: { face: count }, dropped: { face: count } } } }
// `rolled` holds every die that was thrown, `dropped` the ones the roll set aside again (the
// lower d20 of advantage, a rerolled 1), so the window can count them or leave them out.
const LEDGER_VERSION = 1;
const EMPTY_LEDGER = { version: LEDGER_VERSION, active: null, names: {}, sessions: [] };

// How long the recording GM collects rolls before writing them, so a fireball's eight dice and
// the next attack go to the server as one save instead of a save per message.
const FLUSH_DELAY_MS = 1500;


// ── Pure helpers, no Foundry needed (tested in tests/modules.test.mjs) ─────────────────────────

/**
 * The plain dice in a message's rolls: every d-something with a whole number of faces, each
 * result as its face and whether the roll set it aside. Fate dice, coins and anything that isn't
 * a numbered die are left out, and so are bonuses, since they are not dice at all.
 * @returns {{faces: number, results: {face: number, dropped: boolean}[]}[]}
 */
export function diceOf(rolls) {
    const dice = [];
    for (const roll of rolls ?? []) {
        for (const die of roll?.dice ?? []) {
            const denomination = die.constructor?.DENOMINATION ?? die.denomination;
            const faces = Number(die.faces);
            if (denomination !== 'd' || !Number.isInteger(faces) || faces < 2) continue;
            const results = (die.results ?? [])
                .filter(r => Number.isInteger(r?.result) && r.result >= 1 && r.result <= faces)
                .map(r => ({ face: r.result, dropped: r.active === false }));
            if (results.length) dice.push({ faces, results });
        }
    }
    return dice;
}

/** Adds one message's dice to a tally, under the user who rolled them. Returns the tally. */
export function addDice(tally, userId, dice) {
    for (const { faces, results } of dice) {
        const entry = ((tally[userId] ??= {})[faces] ??= { rolled: {}, dropped: {} });
        for (const { face, dropped } of results) {
            entry.rolled[face] = (entry.rolled[face] ?? 0) + 1;
            if (dropped) entry.dropped[face] = (entry.dropped[face] ?? 0) + 1;
        }
    }
    return tally;
}

/** Sums tallies into a new one, e.g. every session of the campaign, or public and private. */
export function mergeTallies(...tallies) {
    const out = {};
    for (const tally of tallies) {
        for (const [userId, sizes] of Object.entries(tally ?? {})) {
            for (const [faces, entry] of Object.entries(sizes)) {
                const target = ((out[userId] ??= {})[faces] ??= { rolled: {}, dropped: {} });
                for (const kind of ['rolled', 'dropped']) {
                    for (const [face, n] of Object.entries(entry[kind] ?? {})) {
                        target[kind][face] = (target[kind][face] ?? 0) + n;
                    }
                }
            }
        }
    }
    return out;
}

/**
 * One die size for one or more users, ready to show: how often each face came up, how many
 * dice, the lowest and highest face (nat 1 and nat 20 on a d20) and the average against the
 * average a fair die would give.
 * @param {number} faces
 * @param {{rolled: object, dropped: object}[]} entries  one per user to count together
 */
export function summarize(faces, entries, { includeDropped = true } = {}) {
    const counts = Array.from({ length: faces }, () => 0);
    for (const entry of entries) {
        for (let face = 1; face <= faces; face++) {
            const rolled = entry?.rolled?.[face] ?? 0;
            const dropped = includeDropped ? 0 : (entry?.dropped?.[face] ?? 0);
            counts[face - 1] += Math.max(0, rolled - dropped);
        }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    const sum = counts.reduce((acc, n, i) => acc + n * (i + 1), 0);
    return {
        faces,
        counts,
        total,
        lowest: counts[0],
        highest: counts[faces - 1],
        average: total ? sum / total : null,
        expected: (faces + 1) / 2
    };
}

/**
 * Who may see a message's dice: 'public' for everyone, 'private' for the roller and the GM
 * (whispered and self rolls), 'blind' for the GM alone (blind rolls the roller never saw).
 */
export function visibilityOf({ whisper, blind } = {}) {
    if (blind) return 'blind';
    const whispered = Array.isArray(whisper) ? whisper.length > 0 : (whisper?.size ?? 0) > 0;
    return whispered ? 'private' : 'public';
}

/** The parts of one session a user may see: the GM everything, a player the open rolls and their own. */
export function visibleTallies(session, userId, isGM) {
    if (isGM) return [session.public, session.private, session.blind];
    const own = session.private?.[userId];
    return own ? [session.public, { [userId]: own }] : [session.public];
}

/** A ledger as this version expects it, whatever was stored (nothing, an older shape). */
export function normalizeLedger(raw) {
    const ledger = foundryClone(raw && typeof raw === 'object' ? raw : EMPTY_LEDGER);
    ledger.version = LEDGER_VERSION;
    ledger.names ??= {};
    ledger.sessions = Array.isArray(ledger.sessions) ? ledger.sessions : [];
    for (const session of ledger.sessions) {
        session.public ??= {};
        session.private ??= {};
        session.blind ??= {};
    }
    if (!ledger.sessions.some(s => s.id === ledger.active)) ledger.active = null;
    return ledger;
}

/** The die sizes present in a tally, d20 first since that's the one people ask about. */
export function dieSizes(tally) {
    const sizes = new Set();
    for (const perUser of Object.values(tally ?? {})) Object.keys(perUser).forEach(f => sizes.add(Number(f)));
    return [...sizes].sort((a, b) => (b === 20) - (a === 20) || a - b);
}

function foundryClone(value) {
    return globalThis.foundry?.utils?.deepClone ? foundry.utils.deepClone(value) : structuredClone(value);
}


// ── Settings ───────────────────────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'ledger', {
        scope: 'world', config: false, type: Object, default: EMPTY_LEDGER,
        onChange: () => LedgerWindow.refresh()
    });
    game.settings.register(MODULE_ID, 'whoCanView', {
        name: 'DICELEDGER.WhoCanView',
        hint: 'DICELEDGER.WhoCanViewHint',
        scope: 'world', config: true, type: String, default: 'everyone',
        choices: { everyone: 'DICELEDGER.WhoCanViewEveryone', gm: 'DICELEDGER.WhoCanViewGM' },
        onChange: () => { ui.controls?.render({ reset: true }); LedgerWindow.refresh(); }
    });
    game.settings.register(MODULE_ID, 'remind', {
        name: 'DICELEDGER.Remind',
        hint: 'DICELEDGER.RemindHint',
        scope: 'user', config: true, type: Boolean, default: true
    });
    game.settings.registerMenu(MODULE_ID, 'open', {
        name: 'DICELEDGER.Title',
        label: 'DICELEDGER.Open',
        hint: 'DICELEDGER.OpenHint',
        icon: 'fas fa-dice-d20',
        type: LedgerMenu,
        restricted: false
    });
});

function readLedger() {
    return normalizeLedger(game.settings.get(MODULE_ID, 'ledger'));
}

function canView() {
    return game.user.isGM || game.settings.get(MODULE_ID, 'whoCanView') === 'everyone';
}

/** Only one client records, so a roll is counted once: the GM Foundry treats as the active one. */
function isRecorder() {
    const active = game.users.activeGM;
    return active ? active.isSelf : false;
}


// ── Recording ──────────────────────────────────────────────────────────────────────────────────

// Rolls waiting to be written, each tagged with the session that was running when it was rolled,
// so ending a session a second later still files them under the right one.
let queue = [];
let flushTimer = null;

Hooks.on('createChatMessage', (message) => {
    try {
        if (!isRecorder() || !message.rolls?.length) return;
        const active = game.settings.get(MODULE_ID, 'ledger')?.active;
        if (!active) return;
        const dice = diceOf(message.rolls);
        if (!dice.length) return;
        const author = message.author ?? game.users.get(message._source?.author ?? message._source?.user);
        if (!author) return;
        queue.push({
            session: active,
            userId: author.id,
            name: author.name,
            visibility: visibilityOf(message),
            dice
        });
        flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
    } catch (err) {
        console.error(`${MODULE_ID} | Couldn't record a roll:`, err);
    }
});

// Every change to the ledger goes through this one chain, read, change, write, one after the
// other. A world setting only changes locally once the server has saved it, so two changes built
// side by side would both start from the old ledger and the later one would erase the earlier:
// a session ended while a fireball's dice were still being saved would lose the fireball.
let writing = Promise.resolve();

/**
 * Changes the ledger and saves it, after every change before it has been saved.
 * `change` gets the current ledger to edit; returning false skips the save.
 */
function mutate(change) {
    const run = writing.then(async () => {
        const ledger = readLedger();
        const result = await change(ledger);
        if (result === false) return false;
        await game.settings.set(MODULE_ID, 'ledger', ledger);
        return result ?? true;
    });
    writing = run.catch(err => console.error(`${MODULE_ID} | Couldn't save the ledger:`, err));
    return run;
}

/** Writes the rolls waiting in the queue. */
function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!queue.length) return writing;
    const pending = queue;
    queue = [];
    return mutate(ledger => {
        for (const item of pending) {
            const session = ledger.sessions.find(s => s.id === item.session);
            if (!session) continue;
            addDice(session[item.visibility] ??= {}, item.userId, item.dice);
            ledger.names[item.userId] = item.name;
        }
    }).catch(() => {});
}

// The GM leaving with rolls still waiting: try to write them. A reload can still cut this off,
// so the last second or so of rolls may be lost; the README says so.
globalThis.window?.addEventListener('beforeunload', () => { if (queue.length) flush(); });


// ── Sessions ───────────────────────────────────────────────────────────────────────────────────

// Only the recording GM changes sessions. Another GM writing the ledger from their own copy could
// bring an ended session back or erase rolls the recording GM is still saving.
function canManage() {
    return game.user.isGM && isRecorder();
}

async function startSession() {
    if (!canManage()) return ui.notifications.warn(game.i18n.localize('DICELEDGER.NotRecorder'));
    flush();
    let started;
    await mutate(ledger => {
        const now = new Date().toISOString();
        const running = ledger.sessions.find(s => s.id === ledger.active);
        if (running) running.ended = now;
        const number = ledger.sessions.length + 1;
        const date = new Date().toLocaleDateString(game.i18n.lang);
        started = {
            id: foundry.utils.randomID(),
            name: game.i18n.format('DICELEDGER.SessionName', { number, date }),
            started: now, ended: null, public: {}, private: {}, blind: {}
        };
        ledger.sessions.push(started);
        ledger.active = started.id;
    });
    ui.notifications.info(game.i18n.format('DICELEDGER.Started', { name: started.name }));
}

async function endSession() {
    if (!canManage()) return ui.notifications.warn(game.i18n.localize('DICELEDGER.NotRecorder'));
    flush();
    let ended = null;
    await mutate(ledger => {
        const running = ledger.sessions.find(s => s.id === ledger.active);
        if (!running) return false;
        running.ended = new Date().toISOString();
        ledger.active = null;
        ended = running.name;
    });
    if (ended) ui.notifications.info(game.i18n.format('DICELEDGER.Ended', { name: ended }));
}

async function deleteSession(id) {
    if (!canManage()) {
        ui.notifications.warn(game.i18n.localize('DICELEDGER.NotRecorder'));
        return false;
    }
    const session = readLedger().sessions.find(s => s.id === id);
    if (!session) return false;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('DICELEDGER.DeleteTitle') },
        content: `<p>${game.i18n.format('DICELEDGER.DeleteConfirm', { name: foundry.utils.escapeHTML(session.name) })}</p>`
    });
    if (!confirmed) return false;
    flush();
    return mutate(ledger => {
        if (!ledger.sessions.some(s => s.id === id)) return false;
        ledger.sessions = ledger.sessions.filter(s => s.id !== id);
        if (ledger.active === id) ledger.active = null;
    });
}

// A GM arriving without a session running gets a nudge, since nothing is counted until one is.
Hooks.once('ready', () => {
    if (!game.user.isGM || !game.settings.get(MODULE_ID, 'remind')) return;
    if (readLedger().active) return;
    ui.notifications.info(game.i18n.localize('DICELEDGER.Reminder'));
});


// ── Opening it ─────────────────────────────────────────────────────────────────────────────────

// A button among the token tools on the left. Since v13, controls and tools are records keyed by
// name, and a tool with `button: true` runs onChange instead of staying selected.
Hooks.on('getSceneControlButtons', (controls) => {
    const tokens = controls?.tokens ?? controls?.token;
    if (!tokens?.tools || Array.isArray(tokens.tools)) return;
    tokens.tools[MODULE_ID] = {
        name: MODULE_ID,
        title: 'DICELEDGER.Title',
        icon: 'fas fa-dice-d20',
        order: Object.keys(tokens.tools).length,
        button: true,
        visible: canView(),
        onChange: () => LedgerWindow.open()
    };
});

/** The settings menu shape Foundry wants: something with render(). It opens the ledger. */
class LedgerMenu extends foundry.applications.api.ApplicationV2 {
    async render() {
        LedgerWindow.open();
        return this;
    }
}

Hooks.once('ready', () => {
    const module = game.modules.get(MODULE_ID);
    if (module) module.api = { open: () => LedgerWindow.open(), startSession, endSession };
});


// ── The window ─────────────────────────────────────────────────────────────────────────────────

class LedgerWindow extends foundry.applications.api.ApplicationV2 {
    static #instance = null;

    static DEFAULT_OPTIONS = {
        id: `${MODULE_ID}-window`,
        classes: [MODULE_ID],
        window: { title: 'DICELEDGER.Title', icon: 'fas fa-dice-d20', resizable: true },
        position: { width: 560, height: 680 },
        actions: {
            start: () => startSession(),
            end: () => endSession(),
            delete: function () { return this.deleteSelected(); }
        }
    };

    static open() {
        if (!canView()) return ui.notifications.warn(game.i18n.localize('DICELEDGER.NotAllowed'));
        this.#instance ??= new LedgerWindow();
        this.#instance.render({ force: true });
    }

    static refresh() {
        if (!this.#instance?.rendered) return;
        // Switched to GM only while a player had it open: close it rather than keep it updating.
        if (!canView()) this.#instance.close();
        else this.#instance.render();
    }

    // What the viewer picked, kept while the window is open.
    view = { session: 'all', user: 'all', includeDropped: true };

    async deleteSelected() {
        if (this.view.session === 'all') return;
        if (await deleteSession(this.view.session)) this.view.session = 'all';
        this.render();
    }

    async _prepareContext() {
        const ledger = readLedger();
        // A session deleted elsewhere, or by this GM: back to the whole campaign.
        if (!ledger.sessions.some(s => s.id === this.view.session)) this.view.session = 'all';
        const sessions = this.view.session === 'all'
            ? ledger.sessions
            : ledger.sessions.filter(s => s.id === this.view.session);

        // The GM sees every roll; a player the open ones and their own whispered and self rolls.
        const parts = sessions.flatMap(s => visibleTallies(s, game.user.id, game.user.isGM));
        const tally = mergeTallies(...parts);
        const userIds = Object.keys(tally).sort((a, b) => nameOf(ledger, a).localeCompare(nameOf(ledger, b)));
        if (this.view.user !== 'all' && !userIds.includes(this.view.user)) this.view.user = 'all';
        const shownUsers = this.view.user === 'all' ? userIds : [this.view.user];
        const options = { includeDropped: this.view.includeDropped };

        return {
            ledger, tally, userIds, options,
            running: ledger.sessions.find(s => s.id === ledger.active) ?? null,
            sizes: dieSizes(Object.fromEntries(shownUsers.map(id => [id, tally[id]]))).map(faces =>
                summarize(faces, shownUsers.map(id => tally[id]?.[faces]), options)),
            players: userIds.map(id => ({ id, name: nameOf(ledger, id), d20: summarize(20, [tally[id]?.[20]], options) }))
                .filter(p => p.d20.total > 0)
        };
    }

    async _renderHTML(context) {
        const t = key => game.i18n.localize(key);
        const esc = foundry.utils.escapeHTML;
        const { ledger, running } = context;
        const div = document.createElement('div');
        div.className = `${MODULE_ID}-body`;

        const sessionOptions = [`<option value="all">${t('DICELEDGER.AllSessions')}</option>`,
            ...[...ledger.sessions].reverse().map(s =>
                `<option value="${s.id}" ${s.id === this.view.session ? 'selected' : ''}>${esc(s.name)}${s.id === ledger.active ? ` · ${t('DICELEDGER.Running')}` : ''}</option>`)];
        const userOptions = [`<option value="all">${t('DICELEDGER.Everyone')}</option>`,
            ...context.userIds.map(id =>
                `<option value="${id}" ${id === this.view.user ? 'selected' : ''}>${esc(nameOf(ledger, id))}</option>`)];

        const status = running
            ? `<p class="status recording"><i class="fas fa-circle"></i> ${game.i18n.format('DICELEDGER.Recording', { name: esc(running.name) })}</p>`
            : `<p class="status idle"><i class="far fa-circle"></i> ${t('DICELEDGER.NotRecording')}</p>`;
        const gmButtons = !game.user.isGM ? '' : !canManage()
            ? `<p class="hint">${t('DICELEDGER.NotRecorder')}</p>`
            : `
            <div class="buttons">
                ${running
                    ? `<button type="button" data-action="end"><i class="fas fa-stop"></i> ${t('DICELEDGER.End')}</button>`
                    : `<button type="button" data-action="start"><i class="fas fa-play"></i> ${t('DICELEDGER.Start')}</button>`}
                ${this.view.session === 'all' ? '' : `<button type="button" data-action="delete"><i class="fas fa-trash"></i> ${t('DICELEDGER.Delete')}</button>`}
            </div>`;

        div.innerHTML = `
            <header>
                ${status}
                ${gmButtons}
                <div class="filters">
                    <label>${t('DICELEDGER.Session')} <select name="session">${sessionOptions.join('')}</select></label>
                    <label>${t('DICELEDGER.Player')} <select name="user">${userOptions.join('')}</select></label>
                    <label class="checkbox" data-tooltip="${esc(t('DICELEDGER.IncludeDroppedHint'))}">
                        <input type="checkbox" name="includeDropped" ${this.view.includeDropped ? 'checked' : ''}>
                        ${t('DICELEDGER.IncludeDropped')}
                    </label>
                </div>
            </header>
            ${context.sizes.length ? '' : `<p class="empty">${t(ledger.sessions.length ? 'DICELEDGER.NothingYet' : 'DICELEDGER.NoSessions')}</p>`}
            ${this.view.user === 'all' && context.players.length ? playersTable(context.players) : ''}
            ${context.sizes.map(dieSection).join('')}`;
        return div;
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    _onRender() {
        for (const select of this.element.querySelectorAll('select[name], input[name="includeDropped"]')) {
            select.addEventListener('change', (event) => {
                const { name, value, checked, type } = event.currentTarget;
                this.view[name] = type === 'checkbox' ? checked : value;
                this.render();
            });
        }
    }

    _onClose(options) {
        super._onClose?.(options);
        LedgerWindow.#instance = null;
    }
}

function nameOf(ledger, userId) {
    return game.users.get(userId)?.name ?? ledger.names[userId] ?? game.i18n.localize('DICELEDGER.UnknownPlayer');
}

function formatAverage(value) {
    return value === null ? '–' : value.toLocaleString(game.i18n.lang, { maximumFractionDigits: 2 });
}

/** The table people actually came for: d20s, nat 1s and nat 20s per player. */
function playersTable(players) {
    const t = key => game.i18n.localize(key);
    const rows = players.map(({ name, d20 }) => `
        <tr>
            <td>${foundry.utils.escapeHTML(name)}</td>
            <td>${d20.total}</td>
            <td class="nat1">${d20.lowest}</td>
            <td class="nat20">${d20.highest}</td>
            <td>${formatAverage(d20.average)}</td>
        </tr>`).join('');
    return `
        <section class="players">
            <h3>${t('DICELEDGER.D20ByPlayer')}</h3>
            <table>
                <thead><tr>
                    <th>${t('DICELEDGER.Player')}</th><th>${t('DICELEDGER.D20s')}</th>
                    <th>${t('DICELEDGER.Nat1')}</th><th>${t('DICELEDGER.Nat20')}</th><th>${t('DICELEDGER.Average')}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </section>`;
}

/** One die size: the numbers, then a bar per face with a line where a fair die would sit. */
function dieSection(summary) {
    const { faces, counts, total, lowest, highest, average, expected } = summary;
    const peak = Math.max(1, ...counts);
    const fair = total / faces;
    // On a d100 only every tenth face gets its number, or they run into each other.
    const labelled = i => faces <= 20 || i === 0 || (i + 1) % 10 === 0;
    const bars = counts.map((n, i) => `
        <div class="bar ${i === 0 ? 'low' : ''} ${i === faces - 1 ? 'high' : ''}" data-tooltip="${i + 1}: ${n}">
            <span class="fill" style="height:${(n / peak) * 100}%"></span>
            ${labelled(i) ? `<span class="face">${i + 1}</span>` : ''}
        </div>`).join('');
    // The bars stand on the face labels' strip, so the line is measured from there too.
    const fairLine = total
        ? `<span class="fair" style="bottom:calc(1.1rem + (100% - 1.1rem) * ${fair / peak})" data-tooltip="${foundry.utils.escapeHTML(game.i18n.localize('DICELEDGER.FairLine'))}"></span>`
        : '';
    return `
        <section class="die" data-faces="${faces}">
            <h3>d${faces}</h3>
            <p class="numbers">
                ${game.i18n.format('DICELEDGER.Rolled', { total })} ·
                ${game.i18n.format('DICELEDGER.LowHigh', { low: lowest, high: highest, max: faces })} ·
                ${game.i18n.format('DICELEDGER.AverageOf', { average: formatAverage(average), expected: formatAverage(expected) })}
            </p>
            ${faces <= 100 ? `<div class="chart ${faces > 20 ? 'dense' : ''}">${fairLine}${bars}</div>` : ''}
        </section>`;
}

const MODULE_ID = 'hp-in-bar';

// The dnd5e attribute the numbers belong to. Any other bar keeps Foundry's plain look.
const HP_ATTRIBUTE = 'attributes.hp';

// Where the AC adjustment lives: one Active Effect per actor, found again by this flag.
const AC_BONUS_KEY = 'system.attributes.ac.bonus';
const AC_FLAG = 'acAdjustment';

// Badge colours: plain, and while an adjustment is on so nobody forgets the Shield spell.
const BADGE_FILL = 0x1f2633;
const BADGE_BORDER = 0xc9ced6;
const BADGE_BORDER_ADJUSTED = 0xf2c14e;

// One text style shared by every token, rebuilt only when a setting changes.
let style = null;

// Settings
Hooks.once('init', () => {
    const { ColorField } = foundry.data.fields;

    game.settings.register(MODULE_ID, 'visibleTo', {
        name: 'HPINBAR.VisibleTo',
        hint: 'HPINBAR.VisibleToHint',
        scope: 'world', config: true, onChange: redrawAll, type: String, default: 'owner',
        choices: {
            owner: 'HPINBAR.VisibleToOwner',
            everyone: 'HPINBAR.VisibleToEveryone',
            gm: 'HPINBAR.VisibleToGM'
        }
    });
    game.settings.register(MODULE_ID, 'acVisibleTo', {
        name: 'HPINBAR.AcVisibleTo',
        hint: 'HPINBAR.AcVisibleToHint',
        scope: 'world', config: true, onChange: redrawAll, type: String, default: 'owner',
        choices: {
            owner: 'HPINBAR.VisibleToOwner',
            everyone: 'HPINBAR.VisibleToEveryone',
            gm: 'HPINBAR.VisibleToGM',
            off: 'HPINBAR.AcOff'
        }
    });
    game.settings.register(MODULE_ID, 'acWarning', {
        name: 'HPINBAR.AcWarning',
        hint: 'HPINBAR.AcWarningHint',
        scope: 'client', config: true, type: Boolean, default: false
    });
    game.settings.register(MODULE_ID, 'fontSize', {
        name: 'HPINBAR.FontSize',
        hint: 'HPINBAR.FontSizeHint',
        scope: 'client', config: true, onChange: redrawAll, type: Number, default: 16,
        range: { min: 8, max: 48, step: 1 }
    });
    game.settings.register(MODULE_ID, 'textColor', {
        name: 'HPINBAR.TextColor',
        hint: 'HPINBAR.TextColorHint',
        scope: 'client', config: true, onChange: redrawAll,
        type: new ColorField({ nullable: false, initial: '#ffffff' }), default: '#ffffff'
    });
    game.settings.register(MODULE_ID, 'strokeColor', {
        name: 'HPINBAR.StrokeColor',
        hint: 'HPINBAR.StrokeColorHint',
        scope: 'client', config: true, onChange: redrawAll,
        type: new ColorField({ nullable: false, initial: '#000000' }), default: '#000000'
    });
    game.settings.register(MODULE_ID, 'strokeWidth', {
        name: 'HPINBAR.StrokeWidth',
        hint: 'HPINBAR.StrokeWidthHint',
        scope: 'client', config: true, onChange: redrawAll, type: Number, default: 4,
        range: { min: 0, max: 12, step: 1 }
    });
});


// V13 Logic
function drawBarsWrapper(wrapped, ...args) {
    // Foundry draws the bars natively (with bar.clear() and positioning)
    const result = wrapped.call(this, ...args);

    try {
        // If token are not visible or have no bars -> skip
        if (!this.actor || this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) {
            if (this.bars?._acBadge) this.bars._acBadge.visible = false;
            return result;
        }
        const allowed = canSeeNumbers(this);

        // Foundry interates over bar1 & bar2
        ["bar1", "bar2"].forEach((b) => {
            const bar = this.bars[b];
            const attr = this.document.getBarAttribute(b);

            // not HP || invisible || not for this user -> disable text
            if (!allowed || !isHPBar(attr) || !bar.visible) {
                if (bar._hpText) bar._hpText.visible = false;
                return;
            }

            const text = `${attr.value} / ${attr.max}`;

            // adds text as child of graph-bar
            if (!bar._hpText || bar._hpText.destroyed) {
                const TextClass = foundry.canvas.containers?.PreciseText ?? PIXI.Text;
                bar._hpText = new TextClass(text, getStyle());
                bar._hpText.anchor.set(0.5, 0.5);
                bar.addChild(bar._hpText);
            } else {
                bar._hpText.text = text;
                bar._hpText.style = getStyle();
            }

            // makes sure that text is over the graphics
            bar.sortableChildren = true;
            bar._hpText.zIndex = 100;

            // centre on the bar Foundry just drew, measured with the text left out, so this
            // follows whatever size core gives its bars
            const bounds = barBounds(bar);
            const width = bounds.width || this.w;
            bar._hpText.x = bounds.x + width / 2;
            bar._hpText.y = bounds.y + bounds.height / 2;
        });
    } catch (err) {
        console.error(`${MODULE_ID} | Error drawing HP text:`, err);
    }

    try {
        drawAcBadge(this);
    } catch (err) {
        console.error(`${MODULE_ID} | Error drawing AC badge:`, err);
    }

    return result;
}

/** A bar's drawn rectangle in its own coordinates, with our text left out of the measurement. */
function barBounds(bar) {
    const text = bar._hpText;
    const shown = text?.visible;
    if (text) text.visible = false;
    const bounds = bar.getLocalBounds();
    if (text) text.visible = shown;
    return bounds;
}


// AC badge
// A small shield with the AC, pinned to the left end of bar1. It lives in the token's bars
// container, so it shows and hides with the bars (hover, owner, always).
function drawAcBadge(token) {
    const bars = token.bars;
    if (!bars) return;
    const ac = readAc(token.actor);
    const show = ac && canSee(token, 'acVisibleTo');

    if (!show) {
        if (bars._acBadge) bars._acBadge.visible = false;
        return;
    }

    let badge = bars._acBadge;
    if (!badge || badge.destroyed) {
        badge = new PIXI.Container();
        badge.eventMode = 'none';
        badge._shape = badge.addChild(new PIXI.Graphics());
        const TextClass = foundry.canvas.containers?.PreciseText ?? PIXI.Text;
        badge._text = badge.addChild(new TextClass('', getStyle()));
        badge._text.anchor.set(0.5, 0.5);
        bars._acBadge = bars.addChild(badge);
        bars.sortableChildren = true;
        badge.zIndex = 200;
    }

    // Sized from the HP font, so one setting scales both.
    const size = game.settings.get(MODULE_ID, 'fontSize');
    const w = Math.round(size * 1.6);
    const h = Math.round(size * 1.8);
    const adjusted = ac.adjustment !== 0;

    badge._shape.clear();
    badge._shape.lineStyle(Math.max(1, size / 8), adjusted ? BADGE_BORDER_ADJUSTED : BADGE_BORDER, 1);
    badge._shape.beginFill(BADGE_FILL, 0.9);
    drawShield(badge._shape, w, h);
    badge._shape.endFill();

    badge._text.text = String(ac.value);
    badge._text.style = getStyle();
    badge._text.scale.set(0.8);
    badge._text.position.set(0, -h * 0.06);

    // Left end of bar1, vertically on its middle. No bar1 → the token's bottom-left corner.
    const bar = bars.bar1;
    if (bar?.visible) {
        const b = barBounds(bar);
        badge.position.set(bar.x + b.x, bar.y + b.y + b.height / 2);
    } else {
        badge.position.set(0, token.h - h / 2);
    }
    badge.visible = true;
}

/** A heater shield centred on 0,0: flat top, sides that curve into a point at the bottom. */
function drawShield(g, w, h) {
    const x = w / 2, top = -h / 2, bottom = h / 2, shoulder = top + h * 0.45;
    g.moveTo(-x, top);
    g.lineTo(x, top);
    g.lineTo(x, shoulder);
    g.quadraticCurveTo(x, bottom - h * 0.15, 0, bottom);
    g.quadraticCurveTo(-x, bottom - h * 0.15, -x, shoulder);
    g.closePath();
}

/** The actor's derived AC, its active adjustment and any manual override, or null if it has none. */
function readAc(actor) {
    const ac = actor?.system?.attributes?.ac;
    if (!ac || !Number.isFinite(ac.value)) return null;
    const effect = adjustmentEffect(actor);
    const override = Number.isFinite(ac.override) ? ac.override : null;
    return { value: ac.value, adjustment: effect ? adjustmentOf(effect) : 0, override, effect };
}

function adjustmentEffect(actor) {
    return actor.effects.find(e => e.getFlag(MODULE_ID, AC_FLAG)) ?? null;
}

/** What the effect actually adds, read from its change so edits on the sheet count too. */
export function adjustmentOf(effect) {
    if (effect.disabled) return 0;
    const changes = effect.system?.changes ?? effect.changes ?? [];
    const value = Number(changes.find(c => c.key === AC_BONUS_KEY)?.value);
    return Number.isFinite(value) ? value : 0;
}

/**
 * What an AC edit means. `+2`/`-2` shift the adjustment; a bare number is the AC you want, kept
 * as the difference from now; `0`, `=` or nothing clears it. With a manual override set, the
 * system ignores bonuses, so edits go to the override instead.
 * @returns {{action: 'none'|'clear'|'adjust'|'override', adjustment?: number, override?: number}}
 */
export function planAcEdit(input, { value, adjustment = 0, override = null }) {
    const raw = String(input ?? '').trim().replace(/\s+/g, '');
    if (raw === '' || raw === '=' || raw === '0') return adjustment ? { action: 'clear' } : { action: 'none' };

    const match = /^([+-])?(\d+)$/.exec(raw);
    if (!match) return { action: 'none' };
    const n = Number(match[2]);
    const delta = match[1] ? (match[1] === '-' ? -n : n) : null;

    if (override !== null) {
        const next = Math.max(0, delta === null ? n : override + delta);
        return next === override ? { action: 'none' } : { action: 'override', override: next };
    }

    const next = delta === null ? adjustment + (n - value) : adjustment + delta;
    if (next === adjustment) return { action: 'none' };
    return next === 0 ? { action: 'clear' } : { action: 'adjust', adjustment: next };
}

/** The effect data for an adjustment, in the shape this core generation expects. */
export function adjustmentEffectData(adjustment, { generation, name, addMode }) {
    const change = generation >= 14
        ? { key: AC_BONUS_KEY, type: 'add', value: adjustment }
        : { key: AC_BONUS_KEY, mode: addMode, value: String(adjustment) };
    const data = {
        name,
        img: 'icons/magic/defensive/shield-barrier-blue.webp',
        disabled: false,
        flags: { [MODULE_ID]: { [AC_FLAG]: true } }
    };
    if (generation >= 14) data.system = { changes: [change] };
    else data.changes = [change];
    return data;
}

async function applyAcEdit(actor, input) {
    const ac = readAc(actor);
    if (!ac) return;
    const plan = planAcEdit(input, ac);

    if (plan.action === 'none') return;
    if (plan.action === 'override') {
        await actor.update({ 'system.attributes.ac.override': plan.override });
        return;
    }
    if (plan.action === 'clear') {
        await ac.effect?.delete();
        return;
    }

    const data = adjustmentEffectData(plan.adjustment, {
        generation: game.release.generation,
        name: game.i18n.localize('HPINBAR.AcAdjustment'),
        addMode: CONST.ACTIVE_EFFECT_MODES?.ADD
    });
    if (ac.effect) {
        const update = { disabled: false };
        if (data.system) update['system.changes'] = data.system.changes;
        else update.changes = data.changes;
        await ac.effect.update(update);
    } else {
        await actor.createEmbeddedDocuments('ActiveEffect', [data]);
    }

    // If the system didn't add it up as expected (an older dnd5e, a calc that ignores bonuses),
    // say so, but only for players who asked: effects that move AC on their own trip it too.
    if (!game.settings.get(MODULE_ID, 'acWarning')) return;
    const expected = ac.value + (plan.adjustment - ac.adjustment);
    const now = actor.system.attributes.ac.value;
    if (now !== expected) {
        ui.notifications.warn(game.i18n.format('HPINBAR.AcMismatch', { expected, now }));
    }
}


// Token HUD: an AC box under the HP box, for anyone who can edit the actor.
Hooks.on('renderTokenHUD', (hud, html) => {
    try {
        const root = html instanceof HTMLElement ? html : html?.[0];
        const token = hud.object;
        const actor = token?.actor;
        const ac = readAc(actor);
        if (!root || !ac || !actor.isOwner || !canSee(token, 'acVisibleTo')) return;
        root.querySelector('.hp-in-bar-ac')?.remove();

        const box = document.createElement('div');
        box.className = 'attribute hp-in-bar-ac';
        box.style.position = 'absolute';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.gap = '4px';

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-shield-halved';
        icon.style.color = ac.adjustment ? '#f2c14e' : 'inherit';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = String(ac.value);
        input.style.textAlign = 'center';
        input.dataset.tooltip = acTooltip(ac);
        input.setAttribute('aria-label', game.i18n.localize('HPINBAR.AcLabel'));
        box.append(icon, input);

        // Next to the HP box if there is one, else at the bottom of the middle column.
        const hpInput = root.querySelector('input[name="bar1.value"]');
        const anchor = hpInput?.closest('.attribute') ?? null;
        const column = anchor?.parentElement ?? root.querySelector('.col.middle') ?? root;
        column.append(box);
        if (anchor) {
            box.style.left = `${anchor.offsetLeft}px`;
            box.style.top = `${anchor.offsetTop + anchor.offsetHeight + 4}px`;
            box.style.width = `${anchor.offsetWidth}px`;
        } else {
            box.style.left = '0';
            box.style.right = '0';
            box.style.top = '100%';
        }

        // Ours alone: keep the HUD's own form from seeing these events.
        let done = false;
        const commit = () => {
            if (done) return;
            done = true;
            applyAcEdit(actor, input.value).catch(err => console.error(`${MODULE_ID} | AC edit failed:`, err));
        };
        input.addEventListener('focus', () => input.select());
        input.addEventListener('change', ev => ev.stopPropagation());
        input.addEventListener('keydown', ev => {
            ev.stopPropagation();
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); input.blur(); }
            if (ev.key === 'Escape') { ev.preventDefault(); done = true; input.value = String(ac.value); input.blur(); }
        });
        input.addEventListener('blur', commit);
    } catch (err) {
        console.error(`${MODULE_ID} | Error adding the AC box to the token HUD:`, err);
    }
});

function acTooltip(ac) {
    const i18n = game.i18n;
    if (ac.override !== null) return i18n.format('HPINBAR.AcTooltipOverride', { value: ac.value });
    if (!ac.adjustment) return i18n.localize('HPINBAR.AcTooltip');
    const sign = ac.adjustment > 0 ? '+' : '−';
    return i18n.format('HPINBAR.AcTooltipAdjusted', {
        base: ac.value - ac.adjustment, adjustment: `${sign}${Math.abs(ac.adjustment)}`
    });
}


// AC follows armour, items and effects, not just actor fields, so redraw on those too.
for (const hook of ['updateActor', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect',
    'createItem', 'updateItem', 'deleteItem']) {
    Hooks.on(hook, doc => {
        const actor = doc instanceof Actor ? doc : (doc.parent instanceof Actor ? doc.parent : doc.parent?.actor);
        actor?.getActiveTokens?.().forEach(t => t.renderFlags?.set({ refreshBars: true }));
    });
}

/** Whether a bar shows dnd5e hit points with a maximum worth dividing by. */
export function isHPBar(attr) {
    return !!attr && attr.type === 'bar' && attr.attribute === HP_ATTRIBUTE && attr.max > 0;
}

/** Whether this user gets the numbers on this token, per the world's setting. */
function canSeeNumbers(token) {
    return canSee(token, 'visibleTo');
}

function canSee(token, setting) {
    return numbersVisible(game.settings.get(MODULE_ID, setting), {
        isGM: game.user.isGM,
        isOwner: token.document.isOwner
    });
}

export function numbersVisible(visibleTo, { isGM, isOwner }) {
    if (visibleTo === 'off') return false;
    if (visibleTo === 'everyone') return true;
    if (visibleTo === 'gm') return isGM;
    return isGM || isOwner;
}


// Patching & Cleanup
// Wrapped at setup, after libWrapper is ready and before the canvas draws its first token.
Hooks.once('setup', () => {
    // V13 token path for libWrapper
    const target = 'foundry.canvas.placeables.Token.prototype.drawBars';
    const TokenClass = foundry.canvas.placeables.Token;

    if (typeof libWrapper !== 'undefined') {
        libWrapper.register(MODULE_ID, target, drawBarsWrapper, 'WRAPPER');
    } else {
        const orig = TokenClass.prototype.drawBars;
        TokenClass.prototype.drawBars = function (...args) {
            return drawBarsWrapper.call(this, orig, ...args);
        };
    }
});


// Helpers
// any changes in settings render token fresh aswell. Every setting calls this from onChange,
// which fires for client settings too (updateSetting only fires for world ones).
function redrawAll() {
    style = null;
    if (canvas?.ready) canvas.tokens.placeables.forEach(t => t.renderFlags?.set({ refreshBars: true }));
}

function getStyle() {
    style ??= new PIXI.TextStyle({
        fontFamily: 'Signika, Arial, sans-serif',
        fontSize: game.settings.get(MODULE_ID, 'fontSize'),
        fill: cssColor(game.settings.get(MODULE_ID, 'textColor'), '#ffffff'),
        stroke: cssColor(game.settings.get(MODULE_ID, 'strokeColor'), '#000000'),
        strokeThickness: game.settings.get(MODULE_ID, 'strokeWidth'),
        align: 'center'
    });
    return style;
}

/** A setting's colour as #rrggbb, whether it comes back as a string or a Color. */
function cssColor(value, fallback) {
    try {
        const color = foundry.utils.Color.from(value);
        return color.valid ? color.css : fallback;
    } catch {
        return fallback;
    }
}

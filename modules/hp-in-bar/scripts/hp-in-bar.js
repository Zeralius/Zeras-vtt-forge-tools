const MODULE_ID = 'hp-in-bar';

// The dnd5e attribute the numbers belong to. Any other bar keeps Foundry's plain look.
const HP_ATTRIBUTE = 'attributes.hp';

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
        if (!this.actor || this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) return result;
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
            bar._hpText.visible = false;
            const bounds = bar.getLocalBounds();
            bar._hpText.visible = true;
            const width = bounds.width || this.w;
            bar._hpText.x = bounds.x + width / 2;
            bar._hpText.y = bounds.y + bounds.height / 2;
        });
    } catch (err) {
        console.error(`${MODULE_ID} | Error drawing HP text:`, err);
    }

    return result;
}

/** Whether a bar shows dnd5e hit points with a maximum worth dividing by. */
export function isHPBar(attr) {
    return !!attr && attr.type === 'bar' && attr.attribute === HP_ATTRIBUTE && attr.max > 0;
}

/** Whether this user gets the numbers on this token, per the world's setting. */
function canSeeNumbers(token) {
    return numbersVisible(game.settings.get(MODULE_ID, 'visibleTo'), {
        isGM: game.user.isGM,
        isOwner: token.document.isOwner
    });
}

export function numbersVisible(visibleTo, { isGM, isOwner }) {
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

const MODULE_ID = 'hp-in-bar';

// Settings 
Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'fontSize', {
        name: 'HP Font Size',
        hint: 'Font size for the HP text inside the token health bar.',
        scope: 'client', config: true, type: Number, default: 16,
        range: { min: 8, max: 48, step: 1 }
    });
    game.settings.register(MODULE_ID, 'textColor', {
        name: 'HP Text Color',
        hint: 'Colour of the HP text.',
        scope: 'client', config: true, type: String, default: '#FFFFFF'
    });
    game.settings.register(MODULE_ID, 'strokeColor', {
        name: 'HP Stroke/Outline Color',
        hint: 'Outline colour for readability against the bar background.',
        scope: 'client', config: true, type: String, default: '#000000'
    });
    game.settings.register(MODULE_ID, 'strokeWidth', {
        name: 'HP Stroke Width',
        hint: 'Thickness of the text outline in pixels.',
        scope: 'client', config: true, type: Number, default: 4,
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

        // Foundry interates over bar1 & bar2
        ["bar1", "bar2"].forEach((b) => {
            const bar = this.bars[b];
            const attr = this.document.getBarAttribute(b);

            // if invalid || invisible || null -> disable text
            if (!attr || attr.type !== "bar" || attr.max === 0 || !bar.visible) {
                if (bar._hpText) bar._hpText.visible = false;
                return;
            }

            // checks if attr tracks hitpoints
            const isHP = attr.attribute && (attr.attribute.toLowerCase().includes('hp') || attr.attribute.toLowerCase().includes('health'));
            if (!isHP) {
                if (bar._hpText) bar._hpText.visible = false;
                return;
            }

            const text = `${attr.value} / ${attr.max}`;

            // adds text as child of graph-bar
            if (!bar._hpText || bar._hpText.destroyed) {
                bar._hpText = new PIXI.Text(text, getStyle());
                bar._hpText.anchor.set(0.5, 0.5);
                bar.addChild(bar._hpText);
            } else {
                bar._hpText.text = text;
                bar._hpText.style = getStyle();
                bar._hpText.visible = true;
            }

            // makes sure that text is over the graphics
            bar.sortableChildren = true;
            bar._hpText.zIndex = 100;

            // find coordinates
            const { width, height } = this.document.getSize();
            const s = canvas.dimensions?.uiScale || 1;
            const bw = width;
            const bh = 8 * (this.document.height >= 2 ? 1.5 : 1) * s;

            // since text is child of bar-container:
            // (0,0) is top left
            bar._hpText.x = bw / 2;
            bar._hpText.y = bh / 2;
        });
    } catch (err) {
        console.error(`${MODULE_ID} | Error drawing HP text:`, err);
    }

    return result;
}


// Patching & Cleanup
Hooks.once('ready', () => {
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

    // Token bar clean new render (Renderflags vor v13)
    if (canvas?.ready) {
        canvas.tokens.placeables.forEach(t => t.renderFlags?.set({ refreshBars: true }));
    }
});

// any changes in settings render token fresh aswell
Hooks.on('updateSetting', setting => {
    if (setting.key.startsWith(`${MODULE_ID}.`) && canvas?.ready) {
        canvas.tokens.placeables.forEach(t => t.renderFlags?.set({ refreshBars: true }));
    }
});


// Helpers
function getStyle() {
    return new PIXI.TextStyle({
        fontFamily: 'Signika, Arial, sans-serif',
        fontSize: game.settings.get(MODULE_ID, 'fontSize'),
        fill: game.settings.get(MODULE_ID, 'textColor'),
        stroke: game.settings.get(MODULE_ID, 'strokeColor'),
        strokeThickness: game.settings.get(MODULE_ID, 'strokeWidth'),
        align: 'center'
    });
}

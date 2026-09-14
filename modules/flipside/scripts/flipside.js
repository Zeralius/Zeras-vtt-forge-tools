const MODULE_ID = 'flipside';
const FACES_FLAG = 'faces';

// Settings
Hooks.once('init', () => {
    game.settings.register(MODULE_ID, 'duration', {
        name: 'Flip Duration',
        hint: 'How long the whole flip takes, in milliseconds. The image swaps at the halfway point.',
        scope: 'world', config: true, type: Number, default: 300,
        range: { min: 0, max: 1500, step: 50 }
    });
    game.settings.register(MODULE_ID, 'playersCanFlip', {
        name: 'Players Can Flip',
        hint: 'Let players flip tokens they own. Turn this off to make flipping GM-only.',
        scope: 'world', config: true, type: Boolean, default: true
    });
    game.settings.register(MODULE_ID, 'wrap', {
        name: 'Wrap Around',
        hint: 'When you flip past the last image, go back to the first one.',
        scope: 'world', config: true, type: Boolean, default: true
    });

    registerKeybindings();
});


// Keybindings
function registerKeybindings() {
    game.keybindings.register(MODULE_ID, 'flip', {
        name: 'Flip Token',
        hint: 'Flip the selected token(s) to their next image.',
        editable: [{ key: 'KeyF' }],
        onDown: () => flipControlled(1),
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });
    game.keybindings.register(MODULE_ID, 'flipBack', {
        name: 'Flip Token Backwards',
        hint: 'Flip the selected token(s) to their previous image.',
        editable: [{ key: 'KeyF', modifiers: ['Shift'] }],
        onDown: () => flipControlled(-1),
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });
}

function flipControlled(direction) {
    const tokens = canvas?.tokens?.controlled ?? [];
    if (!tokens.length) return false;

    const allowed = tokens.filter(canFlip);
    if (!allowed.length) {
        ui.notifications.warn('Flipside | You do not have permission to flip that token.');
        return true;
    }

    // Fire and forget. Returning true tells Foundry we handled the key, so it does not
    // fall through to another binding while the animation is still running.
    allowed.forEach(token => flipToken(token, direction));
    return true;
}

function canFlip(token) {
    if (game.user.isGM) return true;
    if (!game.settings.get(MODULE_ID, 'playersCanFlip')) return false;
    return token.document.isOwner;
}


// Faces
// The face list is stored as one image path per line, which keeps it a plain string and
// therefore something the normal token config form can submit without any array wrangling.
function getFaces(tokenDocument) {
    const raw = tokenDocument.getFlag(MODULE_ID, FACES_FLAG);
    if (!raw || typeof raw !== 'string') return [];
    return raw.split('\n').map(line => line.trim()).filter(Boolean);
}

/** The next image to show, or null when there is nowhere to go. */
function nextFace(tokenDocument, direction) {
    const faces = getFaces(tokenDocument);
    if (faces.length < 2) return null;

    const current = tokenDocument.texture?.src;
    const index = faces.indexOf(current);

    // If the token is showing something that is not in its own list, treat the flip as a
    // jump to the start rather than doing nothing. Less confusing than silently ignoring it.
    if (index === -1) return faces[0];

    const target = index + direction;
    if (!game.settings.get(MODULE_ID, 'wrap') && (target < 0 || target >= faces.length)) return null;

    return faces[(target + faces.length) % faces.length];
}


// Flipping
const flipping = new Map();

async function flipToken(token, direction) {
    if (flipping.has(token.id)) return;

    const target = nextFace(token.document, direction);
    if (!target) return;

    const duration = game.settings.get(MODULE_ID, 'duration');
    if (duration <= 0) {
        await token.document.update({ 'texture.src': target });
        return;
    }

    // Whatever the mesh is scaled to right now is the value to squash from and return to.
    // Reading it rather than assuming 1 keeps mirrored and oddly-scaled tokens working.
    const baseScaleX = token.mesh?.scale?.x ?? 1;
    flipping.set(token.id, { baseScaleX, scaleX: baseScaleX });

    try {
        await animateScaleX(token, baseScaleX, 0, duration / 2);

        // Swap at the halfway point, while the token is edge-on and the change is invisible.
        // animate:false stops Foundry cross-fading the texture underneath our own animation.
        await token.document.update({ 'texture.src': target }, { animate: false });

        await animateScaleX(token, 0, baseScaleX, duration / 2);
    } catch (err) {
        console.error(`${MODULE_ID} | Flip failed:`, err);
    } finally {
        flipping.delete(token.id);
        // Hand the mesh back to Foundry in the state it expects.
        if (token.mesh) token.mesh.scale.x = baseScaleX;
    }
}

function animateScaleX(token, from, to, duration) {
    return new Promise(resolve => {
        if (duration <= 0) {
            applyScaleX(token, to);
            return resolve();
        }

        const start = performance.now();
        function frame(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = t * t * (3 - 2 * t); // smoothstep, so the squash eases in and out
            applyScaleX(token, from + (to - from) * eased);

            if (t < 1) requestAnimationFrame(frame);
            else resolve();
        }
        requestAnimationFrame(frame);
    });
}

function applyScaleX(token, value) {
    const state = flipping.get(token.id);
    if (state) state.scaleX = value;
    if (token.mesh) token.mesh.scale.x = value;
}

// The texture swap mid-flip makes Foundry refresh the token, which resets the mesh scale and
// would pop the token back to full width for a frame. Re-apply our value after each refresh.
Hooks.on('refreshToken', token => {
    const state = flipping.get(token.id);
    if (state && token.mesh) token.mesh.scale.x = state.scaleX;
});


// Token config tab
// The tab is built by copying the classes and data attributes off the sheet's existing tabs
// rather than hardcoding them, so this keeps working when the sheet's markup changes between
// Foundry versions.
for (const hook of ['renderTokenConfig', 'renderPrototypeTokenConfig']) {
    Hooks.on(hook, (app, element) => {
        try {
            injectFacesTab(app, element);
        } catch (err) {
            console.error(`${MODULE_ID} | Could not add the Flipside tab:`, err);
        }
    });
}

function injectFacesTab(app, element) {
    const root = element instanceof HTMLElement ? element : element?.[0];
    if (!root || root.querySelector(`[data-tab="${MODULE_ID}"]`)) return;

    const nav = root.querySelector('nav.sheet-tabs, nav.tabs, .sheet-tabs, .tabs');
    const sections = root.querySelectorAll('section.tab[data-tab], div.tab[data-tab]');
    const templateLink = nav?.querySelector('[data-tab]');
    const templateSection = sections[sections.length - 1];
    if (!nav || !templateLink || !templateSection) return;

    const group = templateLink.dataset.group ?? templateSection.dataset.group ?? 'sheet';

    const link = document.createElement(templateLink.tagName);
    link.className = templateLink.className;
    link.classList.remove('active');
    link.dataset.tab = MODULE_ID;
    link.dataset.group = group;
    if (templateLink.dataset.action) link.dataset.action = templateLink.dataset.action;
    link.innerHTML = '<i class="fas fa-clone"></i> Flipside';
    nav.appendChild(link);

    const section = document.createElement(templateSection.tagName);
    section.className = templateSection.className;
    section.classList.remove('active');
    section.dataset.tab = MODULE_ID;
    section.dataset.group = group;
    section.innerHTML = facesTabContent(app.document);
    templateSection.parentElement.appendChild(section);

    wireFacesTab(section, root, nav, link, group);
}

function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function facesTabContent(tokenDocument) {
    const faces = getFaces(tokenDocument);
    const current = tokenDocument.texture?.src ?? '';

    // Seed an empty list with the token's own image, so the first thing a user does is add
    // a second face rather than having to re-enter the one they already have.
    const value = faces.length ? faces.join('\n') : current;

    return `
        <fieldset>
            <legend>Flip Images</legend>
            <p class="notes">
                One image path per line, in the order you want to flip through them.
                The token flips to the next line each time you press the flip key.
                Fewer than two lines means nothing to flip between.
            </p>
            <div class="form-group stacked">
                <textarea name="flags.${MODULE_ID}.${FACES_FLAG}" rows="6"
                          data-flipside-faces>${escapeHTML(value)}</textarea>
            </div>
            <div class="form-group">
                <button type="button" data-flipside-browse>
                    <i class="fas fa-file-import"></i> Add image
                </button>
                <button type="button" data-flipside-add-current>
                    <i class="fas fa-plus"></i> Add current image
                </button>
            </div>
        </fieldset>
    `;
}

function wireFacesTab(section, root, nav, link, group) {
    const textarea = section.querySelector('[data-flipside-faces]');

    // Do the tab switching by hand. The sheet's own handler does not know about a tab that
    // was not in its static configuration, so relying on it is how this breaks silently.
    link.addEventListener('click', event => {
        event.preventDefault();
        for (const other of nav.querySelectorAll('[data-tab]')) other.classList.remove('active');
        for (const other of root.querySelectorAll(`.tab[data-group="${group}"], .tab[data-tab]`)) {
            other.classList.remove('active');
        }
        link.classList.add('active');
        section.classList.add('active');
    });

    section.querySelector('[data-flipside-browse]')?.addEventListener('click', async () => {
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
        new FP({
            type: 'imagevideo',
            current: textarea.value.split('\n').pop()?.trim() ?? '',
            callback: path => appendFace(textarea, path)
        }).render(true);
    });

    section.querySelector('[data-flipside-add-current]')?.addEventListener('click', () => {
        const sheetImage = root.querySelector('[name="texture.src"]')?.value;
        if (sheetImage) appendFace(textarea, sheetImage);
    });
}

function appendFace(textarea, path) {
    if (!path) return;
    const lines = textarea.value.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.includes(path)) return;
    lines.push(path);
    textarea.value = lines.join('\n');
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

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


// Core overlay logic (called after every _drawBar)
function applyHPText(token, result, number, bar, data) {
  if (!isHPBar(bar)) return;
  if (!isPC(token)) return;
  if (!data || data.value == null || data.max == null) return;

  const text = `${data.value} / ${data.max}`;

  if (token._hpText) {
    token._hpText.text = text;
    Object.assign(token._hpText.style, getStyle());
  } else {
    token._hpText = new PIXI.Text(text, getStyle());
    token._hpText.anchor.set(0.5, 0.5);
    token.addChild(token._hpText);
  }

  const idx = typeof number === 'number' ? number : (number === 'bar2' ? 1 : 0);
  const barH = Math.max(canvas.dimensions.size / 12, 8);
  const barTop = idx === 0 ? token.h - barH : token.h - (2 * barH) - 2;

  token._hpText.x = token.w / 2;
  token._hpText.y = barTop + barH / 2;
}

async function drawBarWrapper(wrapped, ...args) {
  const result = await wrapped(...args);
  applyHPText(this, result, ...args);
  return result;
}

// Patching & cleanup 
Hooks.once('ready', () => {
  if (typeof libWrapper === 'function') {
    libWrapper.register(MODULE_ID, 'Token.prototype._drawBar', drawBarWrapper, 'WRAPPER');
  } else {
    const orig = Token.prototype._drawBar;
    Token.prototype._drawBar = function (...args) {
      return drawBarWrapper.call(this, orig.bind(this), ...args);
    };
  }
  // Refresh any tokens already on the canvas so the text appears immediately
  canvas?.tokens?.placeables?.forEach(t => t.refresh());
});

Hooks.on('destroyToken', token => {
  token._hpText?.destroy({ children: true });
  token._hpText = null;
});

// Reapply on setting changes without requiring a scene reload
Hooks.on('updateSetting', setting => {
  if (setting.key.startsWith(`${MODULE_ID}.`)) {
    canvas?.tokens?.placeables?.forEach(t => t.refresh());
  }
});

// ---

// Helpers 
function getStyle() {
  return new PIXI.TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: game.settings.get(MODULE_ID, 'fontSize'),
    fill: game.settings.get(MODULE_ID, 'textColor'),
    stroke: game.settings.get(MODULE_ID, 'strokeColor'),
    strokeThickness: game.settings.get(MODULE_ID, 'strokeWidth'),
    align: 'center'
  });
}

function isHPBar(bar) {
  const a = bar?.attribute;
  return a && (a === 'attributes.hp' || a === 'hp' || a.endsWith('.attributes.hp'));
}

function isPC(token) {
  return token?.document?.actor?.type === 'character';
}
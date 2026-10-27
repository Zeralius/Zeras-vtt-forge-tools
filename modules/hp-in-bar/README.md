# HP in Bar

**D&D 5e only.** Puts the actual hit point numbers inside the token's health bar, so you can read
`45 / 50` straight off the canvas without opening a sheet or hovering over anything.

It wraps Foundry's own bar-drawing routine (through libWrapper if you have it, otherwise by
patching the prototype directly) and draws a text overlay that follows the token around and
updates whenever HP changes. Only the bar showing `attributes.hp` gets numbers.

## Who sees the numbers

A world setting, for the GM:

| Choice | Who reads the numbers |
| --- | --- |
| **The token's owners and the GM** (default) | Players see their own characters' HP, the GM sees everything. Enemy bars stay bars. |
| Everyone who can see the bar | Anyone the token's bar is shown to, as before 1.1.0. |
| The GM only | Nobody else, not even on their own character. |

The bar itself still follows the token's own *Display Bars* setting.

## Look

These are per-player, so everyone can set them to taste:

| Setting | Default | What it does |
| --- | --- | --- |
| HP Font Size | `16` | How big the text is. |
| HP Text Color | white | Colour of the numbers. |
| HP Stroke/Outline Color | black | Outline colour, so the text stays readable over a bright bar. |
| HP Stroke Width | `4` | How thick that outline is, in pixels. Set it to 0 to turn it off. |

Changing any of them redraws the tokens straight away, no reload needed.

## Compatibility

Foundry v13 minimum, verified on v14. libWrapper is recommended and isn't required.

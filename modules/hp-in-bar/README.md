# HP in Bar

**D&D 5e only.** Puts the actual hit point numbers inside the token's health bar, so you can read
`45 / 50` straight off the canvas without opening a sheet or hovering over anything.

It wraps Foundry's own bar-drawing routine (through libWrapper if you have it, otherwise by
patching the prototype directly) and draws a PIXI text overlay that follows the token around and
updates whenever HP changes.

## Settings

All of these are per-player, so everyone can set them to taste:

| Setting | Default | What it does |
| --- | --- | --- |
| HP Font Size | `16` | How big the text is. |
| HP Text Color | `#FFFFFF` | Colour of the numbers. |
| HP Stroke/Outline Color | `#000000` | Outline colour, so the text stays readable over a bright bar. |
| HP Stroke Width | `4` | How thick that outline is, in pixels. Set it to 0 to turn it off. |

Changing any of them redraws the tokens straight away, no reload needed.

## Compatibility

Foundry v13 minimum, verified on v14. libWrapper is used when it's installed and isn't required.

# Changelog

Whatever's under the heading for a version gets pulled into that version's GitHub release notes,
so it's worth keeping this up to date.

## Unreleased

- **Who sees the numbers** is a world setting now: the token's owners and the GM (the new
  default), everyone who can see the bar, or the GM only. Before, anyone who could see a bar read
  the exact HP, enemies included.
- The numbers stay sharp when you zoom in (Foundry's `PreciseText` instead of plain PIXI text),
  and the text style is built once instead of on every redraw.
- The text is centred on the bar Foundry actually drew, rather than on a copy of core's
  bar-height formula.
- Only the `attributes.hp` bar gets numbers. Before, any bar whose path contained "hp" or
  "health" did.
- The colours have a colour picker.
- Wraps the bars at `setup` instead of `ready`, so the first draw already has the numbers.
- libWrapper is listed as a recommended module.
- English and German translations.

## 1.0.7

- No code changes. The manifest and download URLs moved to the per-module release setup, so
  updates now come from this module's own manifest.

## 1.0.6

- Fixed the token path for v13 (`foundry.canvas.placeables.Token`). It was still using the v12
  namespaces by mistake, which meant the wrapper never attached.
- Tokens now redraw immediately when you change a setting instead of on the next refresh.

# Changelog

Whatever's under the heading for a version gets pulled into that version's GitHub release notes,
so it's worth keeping this up to date.

## Unreleased

- **Temp HP in the Numbers**, a per-player setting: `343 / 243` with temp HP added in (the new
  default), `243 +100 / 243` with the `+100` in blue as in 1.2.0, or temp HP left out of the text.
- **Less lag.** Every bar redraw used to render the HP text, the temp HP layer and the AC shield
  again from scratch, even when nothing on them had changed. Now only what changed is redrawn,
  each bar is measured once per draw instead of up to four times, and the settings are read once
  instead of on every draw. Moving tokens and changing AC were where it showed.
- The AC shield sits just left of the bar instead of on it, so it no longer covers the start of
  the HP numbers.

## 1.2.0

- **Temp HP in the numbers.** With temporary hit points the text reads `243 +12 / 243`, the
  `+12` in dnd5e's temp HP blue.
- **Temp HP Shield**, a per-player setting, off by default: temp HP as a see-through blue layer
  over the full height of the bar, instead of only dnd5e's thin stripe.

## 1.1.1

- The AC box in the token HUD sits exactly under the HP box, with the shield icon to its left.
  In 1.1.0 it was shifted to the right.

## 1.1.0

- **The AC is on the bar.** A small shield on the left end of the health bar shows the token's
  Armour Class. **Who Sees the AC** is a world setting with the same choices as the HP numbers,
  plus turning it off.
- **Change the AC from the token HUD.** The HUD has an AC box under the HP box: `+2`/`-2` shift
  it, a bare number sets it, `0` or empty goes back to the calculated AC. The change is one
  Active Effect called *AC adjustment*, so the armour calculation underneath is never
  overwritten. The shield turns gold while it's on. With a manual AC override in the sheet,
  edits change the override instead.
- **Warn When the AC Doesn't Add Up**, a per-player setting, off by default: a warning when an AC
  edit ends somewhere other than the number you typed.
- The title is now **HP & AC in Bar**. The id stays `hp-in-bar`, so installs keep updating and
  settings stay where they are.
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

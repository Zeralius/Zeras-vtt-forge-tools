# HP & AC in Bar

**D&D 5e only.** Puts the actual hit point numbers inside the token's health bar, so you can read
`45 / 50` straight off the canvas without opening a sheet or hovering over anything. The AC sits
on the bar too, and you can change it from the token HUD.

It wraps Foundry's own bar-drawing routine (through libWrapper if you have it, otherwise by
patching the prototype directly) and draws a text overlay that follows the token around and
updates whenever HP changes. Only the bar showing `attributes.hp` gets numbers.

## Temporary hit points

When a token has temp HP, the numbers show it in blue: `243 +12 / 243`. The blue is the same one
dnd5e uses for its temp HP stripe, so the two match.

dnd5e marks temp HP with a thin stripe inside the bar that's easy to miss. Turn on **Temp HP
Shield** (per player, off by default) and the temp HP becomes a see-through blue layer over the
full height of the bar with a light edge, like a shield over the green. It's as long as dnd5e's
stripe and shows to anyone who can see the bar.

## Who sees the numbers

A world setting, for the GM:

| Choice | Who reads the numbers |
| --- | --- |
| **The token's owners and the GM** (default) | Players see their own characters' HP, the GM sees everything. Enemy bars stay bars. |
| Everyone who can see the bar | Anyone the token's bar is shown to, as before 1.1.0. |
| The GM only | Nobody else, not even on their own character. |

The bar itself still follows the token's own *Display Bars* setting.

## Armour Class

A small shield with the token's AC sits on the left end of the health bar. It shows and hides with
the bars, and **Who Sees the AC** picks who gets it, with the same choices as the HP numbers plus
*Nobody* to turn it off. The default is the token's owners and the GM, so enemy AC stays hidden.

To change it, right-click the token: the HUD has an AC box under the HP box.

| You type | What happens |
| --- | --- |
| `+2` or `-2` | Shifts the AC by that much. Shield spell, cover, Haste. |
| `17` | Makes the AC 17. |
| `0`, `=` or nothing | Back to the calculated AC. |

dnd5e works AC out from armour, Dexterity and so on, so HP & AC in Bar never overwrites it. The
change goes into one Active Effect on the actor called **AC adjustment**, which you can see,
edit or delete on the sheet like any other effect. While it's on, the shield's border turns gold,
and hovering the box shows the split, such as "15 calculated, +5 adjustment". Taking the armour
off still works out correctly underneath.

If the sheet's armour settings have a **manual AC override**, dnd5e ignores bonuses, so edits in
the box change the override instead.

**Warn When the AC Doesn't Add Up** is a per-player setting, off by default. When it's on, an
edit that doesn't end at the AC you typed gets a warning, for example on an older dnd5e whose
armour calculation skips bonuses. Effects and features that move AC on their own can set it off
too, which is why it's off unless you want it.

## Look

These are per-player, so everyone can set them to taste:

| Setting | Default | What it does |
| --- | --- | --- |
| HP Font Size | `16` | How big the text is. The AC shield scales with it. |
| HP Text Color | white | Colour of the numbers. |
| HP Stroke/Outline Color | black | Outline colour, so the text stays readable over a bright bar. |
| HP Stroke Width | `4` | How thick that outline is, in pixels. Set it to 0 to turn it off. |
| Temp HP Shield | off | Temp HP as a blue shield over the bar instead of dnd5e's thin stripe. |

Changing any of them redraws the tokens straight away, no reload needed.

## Compatibility

Foundry v13 minimum, verified on v14. libWrapper is recommended and isn't required.

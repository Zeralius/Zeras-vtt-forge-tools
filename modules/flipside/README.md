# Flipside

Give a token a list of images and flip between them with a keypress. The token squashes edge-on
like a coin, swaps at the halfway point, and springs back.

Made for wildshape — Druid on one face, bear on the next, wolf after that — but it works for
anything you want to toggle: a disguised NPC, a werewolf, a statue that wakes up, a mimic.

**System-agnostic.** Nothing in here is D&D-specific.

## Using it

1. Open a token's configuration and pick the **Flipside** tab.
2. Add the images you want, one path per line, in the order you want to cycle through them.
   The token's current image is filled in for you, so you usually just add the others.
3. Select the token and press **F**.

**Shift+F** goes backwards through the list. Both keys are rebindable under
*Configure Controls → Flipside*.

You can flip several tokens at once — every selected token you're allowed to flip goes together.

## What it does not do

Flipside is **purely cosmetic**. It changes the picture and nothing else: no HP, no AC, no senses,
no stats. That's deliberate. Real wildshape means swapping the whole actor, and your game system
almost certainly already does that better than a module could — in D&D 5e it's the polymorph and
transform flow on the character sheet.

Use Flipside when you want the *look* to change quickly. Use your system's polymorph when you want
the *creature* to change.

## Settings

| Setting | Scope | Default | What it does |
| --- | --- | --- | --- |
| Flip Duration | World | `300` ms | How long the whole flip takes. Set it to 0 to swap instantly with no animation. |
| Players Can Flip | World | on | Whether players can flip tokens they own. Turn it off to make flipping GM-only. |
| Wrap Around | World | on | Whether flipping past the last image returns to the first, or stops there. |

Players can only ever flip tokens they own, and only while *Players Can Flip* is on. GMs can flip
anything.

## Compatibility

Foundry VTT v13 minimum, verified on v14. No dependencies and no libWrapper needed.

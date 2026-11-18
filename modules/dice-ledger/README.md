# Dice Ledger

Counts every die your players roll, face by face, for the whole campaign: how many d20s each
player rolled, how many came up 1 and how many came up 20, with a chart per die size.

Requires Foundry VTT v13 or newer. Any system: it counts dice, not the system's rules.

## Sessions

Nothing is counted until the GM starts a session, and nothing after it ends. Someone who joins
early and rolls a handful of d20s to test their dice doesn't skew the numbers.

1. Open the ledger with the **dice button** among the token tools on the left, or from the
   module's settings.
2. **Start Session** when the game begins. The window says "Counting rolls" while one runs.
3. **End Session** when you stop. Starting a new session ends the old one.

Joining as GM with no session running shows a reminder; it can be turned off in the settings.
A session started by mistake can be deleted: pick it in the window and **Delete This Session**.

## What counts

- **Only the dice.** `1d20 + 7` counts one d20 showing whatever it showed, never the 7.
  Fate dice and coins are left out.
- **Every die thrown.** Advantage throws two d20s, so both count. **Count dropped dice** in the
  window leaves out the ones the roll set aside again (the lower d20 of advantage, a rerolled 1).
- **Every roll that reaches the chat** while a session runs: attacks, saves, damage, initiative,
  `/roll`. A roll counts for the player who made it.
- **Private rolls stay private.** Whispered and self rolls count, and the player who rolled them
  sees them in their own numbers; other players don't. Blind rolls, whose result even the
  roller never saw, count for the GM only. They are kept apart in the world's data, not hidden
  from someone who goes digging in the browser console.

The counts are recorded by the GM's client, so a GM has to be logged in for rolls to count.
Rolls made in the second or so before a GM closes Foundry may be lost. With several GMs, the
one Foundry treats as the active GM does the counting, and only that GM can start, end or
delete sessions, so two copies of the counts never overwrite each other.

A die changed by a minimum or maximum (`1d20min10`, as dnd5e's Reliable Talent rolls) counts
as the face it ended up showing.

## The window

- **Session:** the whole campaign or one session.
- **Player:** everyone together, or one player.
- **d20s by player:** how many d20s each player rolled, their nat 1s and nat 20s, and their
  average.
- **One chart per die size**, d20 first: a bar per face, the 1 in red and the highest in green,
  and a dashed line where every face would sit on a perfectly fair die.

Tested on Foundry 14.370 with dnd5e 6.1.1: plain and modified rolls, advantage, rerolls,
coins and Fate dice, whispered, blind and self rolls from the GM and a player, and dnd5e
ability checks, saves and skills rolled from the actor.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Who Can Open the Ledger | Everyone | Everyone, or the GM only. |
| Remind Me to Start a Session | on | Per GM. A note when you join and no session runs. |

## For macros

```js
const ledger = game.modules.get('dice-ledger').api;
ledger.open();
await ledger.startSession();
await ledger.endSession();
```

## Storage

Everything is in one world setting: per session, per player, per die size, how often each face
came up. A count per face rather than a line per roll, so years of play stay a few kilobytes.

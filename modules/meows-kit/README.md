# Meows Kit

Imports a one-shot kit written by [Meows](https://github.com/Zeralius/Meows): one scene per map,
gridded or gridless, handouts and notes as journal entries, tokens as actors, the run sheet as a
journal entry per scene with its tokens placed, all in folders named after the kit. Five maps in
the kit, five scenes in the folder, in order.

Requires Foundry VTT v13 or newer. Any system: an actor is only made when the system has an actor
type to make.

## How it works

Meows' Kit tab does the part that needs a desktop: maps fitted and framed, tokens cut round with
a ring, the grid measured against the map's own lines or deliberately switched off. *Write for
Foundry* leaves a folder with the pictures and a `kit.json` holding the numbers. This module does
the part that needs Foundry.

1. Upload that folder through Foundry's file picker, anywhere under your Data folder.
   `modules/meows-kit/kits/` is where the picker starts.
2. Press **Import a kit** at the top of the Scenes sidebar, or in the module's settings, and
   pick the folder.
3. A Folder named after the kit appears in Scenes, one Scene per map with the background, the
   size and the grid the kit says (or no grid, when the kit says so, which is a choice and not a
   missing number), a Folder in Journal with one entry per handout and per note, and, unless
   turned off, a Folder in Actors with one actor per token carrying its picture and disposition.
4. The kit's run sheet, when it has one: one journal entry per scene with a page per fight (who
   is in it, the GM's notes), linked from the scene so its notes button opens it, and each
   fight's tokens placed on the scene hidden, in a row at the top-left, ready to be dragged
   where they go and revealed when the fight starts. Fights on no map go in an entry named
   after the kit. Placing can be turned off in the settings.

There is no way to write into a running Foundry from outside, and writing its database while it
runs corrupts the world. That is why the interface is a folder: it can be uploaded through the
picker, dropped on the server by hand, or written there by Meows once it can reach the server.

## Also from a macro

```js
await game.modules.get('meows-kit').api.importKit('modules/meows-kit/kits/cellar-of-woe');
```

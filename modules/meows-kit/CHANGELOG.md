# Changelog

Whatever sits under a version heading here gets pulled into that version's GitHub release notes.

## 0.2.0

- **The run sheet.** A kit's fights (`encounters` in `kit.json`, written by Meows 2.20.0 or
  newer) become one journal entry per scene, a page per fight with who is in it and the GM's
  notes, linked from the scene so its notes button opens it; fights on no map go in an entry
  named after the kit.
- **Tokens placed.** Each fight's tokens are put on its scene hidden, in a row at the top-left,
  as the kit's actors where those were made and as plain tokens otherwise. Off by a setting.
- Older kits without a run sheet import as before.

## 0.1.0

First release.

- **Import a kit** at the top of the Scenes sidebar and in the module's settings: pick the folder
  Meows wrote (a `kit.json` and the pictures beside it), and a Folder named after the kit holds
  one Scene per map, gridded or gridless as the kit says, with the background offset so the
  grid meets the map's own lines.
- Handouts become journal entries with an image page and a caption; markdown notes become text
  pages.
- Tokens become actors of the system's monster type, or its first type, with the token as the
  picture and the kit's *side* as the disposition. Off by a setting.
- `game.modules.get('meows-kit').api.importKit(folder)` for macros.
- Any system, Foundry v13 or newer.

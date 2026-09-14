# Changelog

Whatever sits under a version heading here gets pulled into that version's GitHub release notes.

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

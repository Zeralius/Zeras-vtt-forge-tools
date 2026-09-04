# Changelog

Whatever's under the heading for a version gets pulled into that version's GitHub release notes,
so it's worth keeping this up to date.

## 1.0.6

- Fixed the token path for v13 (`foundry.canvas.placeables.Token`). It was still using the v12
  namespaces by mistake, which meant the wrapper never attached.
- Tokens now redraw immediately when you change a setting instead of on the next refresh.

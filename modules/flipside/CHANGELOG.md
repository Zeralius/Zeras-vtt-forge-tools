# Changelog

Whatever sits under a version heading here gets pulled into that version's GitHub release notes.

## Unreleased

- **The new image comes out the right size.** The flip used to spring back to the old image's
  scale, so a face with a different pixel size ended up too small or too big, and stretched
  sideways, until something else redrew the token. It now springs out to the size Foundry works
  out for the new image, and hands the mesh back to Foundry when it's done.
- The next image is loaded before the flip starts, so the token is never blank at the halfway
  point.
- When the GM has turned *Players Can Flip* off, players are told that, instead of being told
  they don't own the token.
- English and German translations.
- The README says the animation plays only for the player who pressed the key.

## 0.1.0

First release.

- Flip a token through a list of images with a keypress. **F** goes forward, **Shift+F** back,
  both rebindable.
- Coin-flip animation: the token squashes edge-on, swaps image at the halfway point, springs back.
  Duration is configurable, and 0 turns it off entirely.
- Images are set per token in a **Flipside** tab in the token configuration, one path per line.
- Works on several selected tokens at once.
- Players can only flip tokens they own, and only while the *Players Can Flip* setting is on.
- Cosmetic only. It changes the image and touches nothing else.

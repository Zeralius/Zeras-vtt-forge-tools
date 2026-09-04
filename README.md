# Zera's VTT Forge Tools

A small collection of modules for **Foundry Virtual Tabletop**, built for my D&D 5e campaign.

Everything here needs **Foundry v13 or newer** and is verified on v14. Modules that only work
with a specific system say so.

---

## Modules

| Module | Id | System | Version |
| --- | --- | --- | --- |
| [HP in Bar](modules/hp-in-bar) | `hp-in-bar` | D&D 5e | 1.0.6 |

**HP in Bar** puts the actual numbers inside the token's health bar, so you can read `45 / 50`
straight off the canvas instead of opening a sheet or hovering. Font size, colour and outline are
per-player settings.

---

## Installing

### Everything at once

Paste this into Foundry's *Install Module* dialog:

```
https://raw.githubusercontent.com/Zeralius/Zeras-vtt-forge-tools/main/modules/zeras-forge-tools/module.json
```

That's a bundle module. It contains no code, it just lists every other module as a dependency,
and Foundry asks whether you want to install those too. Say yes and you get the lot.

Worth knowing: Foundry installs a *manifest*, never a repository, so there's no way to point it
at this repo and have it figure the rest out. The bundle is the closest thing, and it's how most
module collections do it. Two caveats:

- Foundry has to fetch each dependency's manifest during install, so this needs a working
  internet connection at install time (it always does, but here it's several requests, not one).
- Updates still happen per module. Foundry checks each one separately, which is what you want,
  since a fix to one module shouldn't force a reinstall of the others. The bundle only handles
  the initial install, and you can disable it afterwards without breaking anything.

### One module on its own

Each module has its own manifest URL:

| Module | Manifest URL |
| --- | --- |
| HP in Bar | `https://raw.githubusercontent.com/Zeralius/Zeras-vtt-forge-tools/main/modules/hp-in-bar/module.json` |

Or grab a zip from the [releases page](https://github.com/Zeralius/Zeras-vtt-forge-tools/releases)
and drop the extracted folder into `Data/modules/`.

---

## Working on this

You need Node 20+. Nothing to install, the scripts only use what ships with Node.

```bash
npm run validate     # check every module.json: ids, versions, URLs, files it references
npm run bundle       # rebuild the bundle module after adding or removing a module
npm run pack         # build dist/<id>.zip for every module
```

`npm run pack -- hp-in-bar` builds just the one.

### Adding a module

```bash
npm run new-module -- concentration-halo "Concentration Halo" "Marks concentrating tokens."
```

You get `modules/<id>/` with a manifest, a stub script and a README, URLs already filled in, and
the bundle updated to include it. Write the thing, add a row to the tables above, commit.

### Releasing

One tag per module, shaped `<module-id>-v<version>`:

```bash
npm run release -- hp-in-bar patch      # 1.0.6 -> 1.0.7
npm run release -- hp-in-bar minor
npm run release -- hp-in-bar 2.0.0      # or just say the version
```

Add `--dry-run` to see what it would do without touching anything.

The script bumps the version, rewrites the manifest's URLs, refreshes the bundle, commits, tags
and pushes. Pushing the tag is what kicks off
[the release workflow](.github/workflows/release.yml), which re-checks everything, builds the zip
and publishes a GitHub release with `<id>.zip` and `<id>.module.json` attached. The loose
manifest is just a convenience for reading the version without downloading the zip; nothing
points at it.

If you'd rather not do it locally: **Actions → Release module → Run workflow**, pick the module
and the bump, and it does the whole thing on GitHub.

Every push and PR also runs [the validation workflow](.github/workflows/validate.yml), so a
broken manifest turns up long before release day rather than after someone's already installed it.

### Why the URLs look the way they do

`manifest` points at `module.json` **on the main branch**. It's stable, and it's per module, which
`releases/latest/...` isn't. A repo-wide "latest" release would break the moment a second module
exists, because there's only one latest release per repo and both modules would fight over it.

`download` points at the zip attached to that module's **exact version tag**, so old releases keep
serving the files they actually shipped with.

Both get generated in [`scripts/lib/modules.mjs`](scripts/lib/modules.mjs). Don't write them by
hand anywhere else, and `npm run validate` will complain if a manifest disagrees.

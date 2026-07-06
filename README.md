# Zera's VTT Forge Tools

A collection of  modules for **Foundry Virtual Tabletop**. (Well... One module for now... But maybe more in the future! xD)

All modules in this repository are built for **Foundry VTT v13** (minimum) and **verified for v14**. System-specific modules call out their requirements, everything else works system-agnostic.

---

## Modules

### HP in Bar (`hp-in-bar`)

D&D 5e only. Renders the current and maximum hit points directly inside the token's health bar on the canvas, so you can see "45 / 50" right where it matters without having to open a sheet or hover over a token.

It hooks into Foundry's own bar-drawing routine to place a clean PIXI text overlay that moves with the token and updates reactively when HP changes. You can tweak the font size, color, and outline (stroke) in the module settings to match your UI.

---

## Installation

In Foundry, use this manifest URL to install any module:

https://github.com/Zeralius/Zeras-vtt-forge-tools/releases/latest/download/module.json

Or drop the `modules/<module-name>` folder straight into your `Data/modules/` directory.

# Omarchy Browser

A Chromium-based web browser for Omarchy with the Omarchy Store built in.

- Tabs, address bar and search (DuckDuckGo), back/forward/reload
- The Omarchy Store in a side panel (Ctrl+B): browse, search, press GET
- GET installs through Omarchy's own installer in a floating terminal, where you type your own password
- Runs on the system Electron (`electron43`), so the package is tiny

## Install

Get it from [omarchystore.com](https://omarchystore.com/app/omarchy-browser/), or:

```bash
sudo pacman -U https://github.com/omarchy-community/omarchy-browser/releases/latest/download/omarchy-browser-1.0.0-1-any.pkg.tar.zst
```

## Shortcuts

| Keys | Action |
|---|---|
| Ctrl+T / Ctrl+W | New / close tab |
| Ctrl+L | Address bar |
| Ctrl+B | Omarchy Store panel |
| Ctrl+Tab | Next tab |
| Alt+Left / Alt+Right | Back / forward |

## Build

```bash
makepkg -f
```

MIT, Omarchy Development Labs.

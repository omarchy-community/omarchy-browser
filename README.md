# Omarchy Browser

The Chromium browser built for Omarchy. The Omarchy Store is built in, your Omarchy theme is applied to the browser the moment you change it, and everything you'd expect from a modern browser is here without the bloat.

## What's in 2.0

- **Your theme, live.** The browser chrome, new-tab page and reader all use the colors of your current Omarchy theme. Switch themes with Super+Ctrl+Shift+Space and the browser follows in under two seconds.
- **Omarchy Store built in** (Ctrl+B). Browse, search, see what's already on your computer, press Get. Installs run through Omarchy's own installer in a floating terminal where you type your own password.
- **Store-aware browsing.** Open any GitHub repo that is in the store and a pill pops up with a one-click Get (or "Installed").
- **Shield.** Tracker and ad blocking for the networks that do most of the tracking, with a live per-page counter in the address bar. One click turns it off.
- **Workspaces.** Separate tab sets for work, play, projects. Everything restores on relaunch.
- **Split view** (Ctrl+\). Two pages side by side.
- **Reader view** (Ctrl+Shift+R) with **Summarize**. If Ollama is running on your computer the summary comes from a local model; otherwise a built-in extractive summary. Nothing leaves your machine.
- **Command palette** (Ctrl+K). Commands, open tabs, store apps, bookmarks, history and web search in one box. `>` commands, `@` apps, `/` tabs.
- Address bar suggestions from history and bookmarks, find in page (Ctrl+F), per-site zoom, downloads panel, right-click menu with "Open in split view", mouse back/forward buttons.
- Runs on the system Electron (`electron43`), so the package is 170 KB.

## Install

Get it from [omarchystore.com](https://omarchystore.com/app/omarchy-browser/), or:

```bash
sudo pacman -U https://github.com/omarchy-community/omarchy-browser/releases/latest/download/omarchy-browser-2.0.0-1-any.pkg.tar.zst
```

## Shortcuts

| Keys | Action |
|---|---|
| Ctrl+T / Ctrl+W | New / close tab |
| Ctrl+Tab, Ctrl+1…9 | Switch tabs |
| Ctrl+L | Address bar |
| Ctrl+K | Command palette |
| Ctrl+B | Omarchy Store panel |
| Ctrl+Shift+W | Workspaces |
| Ctrl+\ | Split view |
| Ctrl+Shift+R | Reader view |
| Ctrl+F | Find in page |
| Ctrl+D | Bookmark |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom |
| Alt+Left / Alt+Right | Back / forward |
| F12 | Developer tools |

## Build

```bash
makepkg -f
```

MIT, Omarchy Development Labs.

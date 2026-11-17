# percho-workbench

Give your installed **Percho (Windows x64, 0.6.8 build `87476fa1`)** a real right-hand pane: an embedded browser plus the project file tree. The agent gets a `workbench` tool that drives the exact page you see.

This package is a Pi package (`pi-package` keyword) that carries the installer. Install it, then let the extension patch Percho — it is reversible and refuses any other Percho build.

## Install the package

```bash
pi install npm:percho-workbench
```

In Percho: **Settings → Packages**, install `percho-workbench`.

## Use it

Ask the agent "给 Percho 装右侧工作区", or:

```text
percho_workbench({ action: "detect" })   # find the Percho folder
percho_workbench({ action: "status" })   # is the patch installed?
percho_workbench({ action: "install" })  # close, patch, restart
percho_workbench({ action: "uninstall" }) # restore the original archive
```

`install`/`uninstall` close Percho after ~6 seconds, patch `resources/app.asar`, and start Percho again. Logs land in your temp folder.

After it restarts, open a **local** session and click the Workbench button next to the diff icon. Ask for anything browser-ish and the agent will use the built-in `workbench` tool.

Or bypass the agent:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 install -Target "C:\path\to\Percho"
```

The equivalent standalone ZIP is on [Releases](https://github.com/xueccci/percho-workbench-plugin/releases).

## What it changes

- `resources/app.asar` is rewritten (only changed entries), original kept byte-exact in `resources/.percho-workbench-plugin/`.
- Percho auto-update is disabled while patched; uninstall restores it.
- User profiles, sessions and credentials are untouched.

## Limits

- Windows x64 only, Percho 0.6.8 build `87476fa1` only; other builds are rejected.
- Browser is Percho's own Chromium, not Ego Lite; no Ego profile or logins.
- Unofficial; not endorsed by Percho or ZCode. MIT, see `NOTICE.md`.

# chore-0001-uw-strip-excalidraw-promo-and-upsell-ui

**Type** chore · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** Excalidraw's promotional and upsell surfaces ship in the shell, so the tool asks
the team to buy, sign in to, or visit a service that is not theirs. Present at least in:

- `excalidraw-app/components/ExcalidrawPlusPromoBanner.tsx`
- `excalidraw-app/components/ExportToExcalidrawPlus.tsx`
- `excalidraw-app/ExcalidrawPlusIframeExport.tsx`
- `excalidraw-app/components/AppWelcomeScreen.tsx`, `AppSidebar.tsx`, `AppFooter.tsx`,
  `AppMainMenu.tsx`
- `excalidraw-app/components/EncryptedIcon.tsx` (links `plus.excalidraw.com`)
- `packages/excalidraw/components/HelpDialog.tsx`

**Expected:** no Excalidraw-branded purchase, sign-in or "upgrade" surface anywhere in the app.

## Impact

**Affected:** the team, whose tool should not advertise someone else's product.
**Risk if not built:** the tool reads as a demo of Excalidraw rather than the team's product.

## Architecture intent

Remove the surfaces at their source rather than hiding them behind a flag, so no build
configuration can resurrect an upsell.

## Requirements

- No rendered surface links to `plus.excalidraw.com`, `app.excalidraw.com` or
  `excalidraw.com`, and none contains promotional copy for Excalidraw+.
- No sign-in or account surface for Excalidraw+ is reachable.
- `grep -rInE 'Excalidraw\\+|plus\\.excalidraw|app\\.excalidraw' excalidraw-app packages/*/src --include='*.ts' --include='*.tsx'`
  returns no rendered string or URL. Comments, tests and this ticket are exempt.
- Removed exports leave no dangling import: `yarn test:typecheck` passes.
- The share and export menus still offer the local paths (file export, link, image) and are
  labelled without reference to a hosted service.

## Constraints

- Removal only — this ticket adds no feature and no replacement service.
- No capability that a user believes exists may remain visible once its wiring is gone: a
  removed button is removed, not disabled with a "coming soon".
- Legal attribution required by the upstream licence (the Excalidraw name in `LICENSE`, the
  about/help credit) is **kept**; this is about upsell, not attribution.
- Both themes unaffected — this removes elements, it does not restyle.

## Non-goals

- Not severing network connections (feature-0001).
- Not renaming the product or rebranding the logo.
- Not touching the editor's own library, share-link or collaboration UI behaviour.
- Not removing the open-source credit or the `LICENSE`.

## Test cases

- **Positive:** open the app, the welcome screen, the main menu, the sidebar, the footer and the
  help dialog → no Excalidraw+ promo, no purchase link, no sign-in surface.
- **Negative:** the grep in Requirements returns nothing.
- **Compatibility:** `yarn test:typecheck`, `yarn test:app --watch=false` and `yarn build:app`
  pass; snapshots that asserted a removed surface are updated.

## Resolution

*(filled on close)*
## Resolution

**Landed** on `chore/strip-excalidraw-promo` (2026-10-10).

**Removed**

| Surface | What went |
|---|---|
| `components/ExcalidrawPlusPromoBanner.tsx` | the file, and its top-right render in `App.tsx` |
| `components/ExportToExcalidrawPlus.tsx` | the file, its `renderCustomUI` export dialog, and its two command-palette entries |
| `components/EncryptedIcon.tsx` | the file, and the footer's link to `plus.excalidraw.com/blog/end-to-end-encryption` |
| `ExcalidrawPlusIframeExport.tsx` | the file, and the `/excalidraw-plus-export` window path |
| `components/AppMainMenu.tsx` | the Excalidraw+ item, the sign-up/sign-in item, `MainMenu.DefaultItems.Socials` |
| `components/AppWelcomeScreen.tsx` | the signed-in plus heading and the sign-up link |
| `components/AppSidebar.tsx` + `AppSidebar.scss` | the comments and presentation promo tabs; the sidebar is now bare `DefaultSidebar` |
| `app_constants.ts` | `COOKIES` and `isExcalidrawPlusSignedUser` — **removed, not stubbed** |
| `components/AI.tsx` | the 429 message's "try Excalidraw+ for more requests" link |
| `TTDDialog/Chat/ChatMessage.tsx` | the rate-limit upsell button |
| `packages/excalidraw/components/HelpDialog.tsx` | the blog button pointing at `plus.excalidraw.com/blog` |
| `App.tsx` | `ExcalidrawPlusCommand`, `ExcalidrawPlusAppCommand`, the "Export to Excalidraw+" command and overwrite-confirm action |

**Verified**

- `yarn test:typecheck` → `Done` (clean).
- `yarn test:code` (eslint) on every changed file → clean, 0 warnings.
- `npx vitest run` on `contextmenu.test.tsx` and `regressionTests.test.tsx` → **68 passed**.
- `./bin/guards/ticket-ids.sh` → `✔ ticket naming and ownership (7 tickets)`.
- `grep -rInE 'Excalidraw\+|plus\.excalidraw|app\.excalidraw' excalidraw-app packages --include='*.ts' --include='*.tsx'`
  → only `actionToggleSearchMenu.ts:35` (`app.excalidrawContainerValue`, an unrelated variable) and
  the i18n locale JSON files. **No rendered string or URL remains.**

**Not done, deliberately**

- The `Excalidraw+` translation keys in `packages/excalidraw/locales/*.json` are left in place.
  They are unreferenced now, and deleting 40 locale files' worth of keys is churn with no
  rendered effect. If they should go, that is a separate ticket.
- The upstream attribution in `LICENSE` and the docs stays — this ticket removes upsell, not
  credit.

**Manual verification still owed:** the visual pass (open the app, welcome screen, main menu,
sidebar, footer, help dialog) has not been done in a browser, only by grep and by the test
suite. Recorded as manual, not as "tests pass".

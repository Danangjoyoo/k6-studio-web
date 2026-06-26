# Header Namespace Placement Design

Date: 2026-06-26

## Goal

Move the namespace selector from the right-side header controls to the left side of the header, immediately after the `k6 Studio / Load lab` identity block.

## Approved Behavior

The header should read visually from left to right as:

```text
[k6 logo] k6 Studio / Load lab  [Namespace selector]                [Active runner] [Running script]
```

The namespace selector remains fully functional: it still lists existing namespaces, can create a new namespace, and notifies `AppShell` through the existing `onNamespaceChange` callback.

The active runner badge and running script path stay on the right side. They remain operational run-state controls, separate from the workspace namespace context.

## Scope

This is a layout-only change. It does not change namespace storage, API behavior, run locking, report history, or file explorer filtering.

## UI Details

`AppHeader` should render the namespace selector in the same flex group as the brand identity, with a subtle separator or spacing so the selector is readable without crowding the product name.

The right-side group should keep `ml-auto` so active runner state remains aligned to the far right.

The layout should remain compact at the existing `h-11` header height. The selector should not overlap the active runner badge or running script badge.

## Testing

Add or update an `AppHeader` component test that verifies the namespace control appears before the active runner status in DOM order. Existing tests should continue to confirm the runner badge and running script badge still render.

Final verification should run:

```bash
npx jest src/components/layout/__tests__/AppHeader.test.tsx --runInBand
npx jest --runInBand
npx tsc --noEmit
npm run lint
npm run build
```

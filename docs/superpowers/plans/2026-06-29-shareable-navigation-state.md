# Shareable Navigation State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser URL share the current namespace, selected script, main tab, selected history report, and selected report preview tab.

**Architecture:** Keep the app as a single Next.js page under the existing `/k6` base path and encode navigation state in query parameters. Add a pure `navigation-state` helper for parsing/building URLs, then make `AppShell` own the selected main tab, report, and report-tab state and pass controlled props into the history components.

**Tech Stack:** Next.js App Router client components, React state/effects, Base UI tabs, TypeScript, Jest, React Testing Library.

---

### Task 1: URL State Helper

**Files:**
- Create: `src/lib/navigation-state.ts`
- Test: `src/lib/__tests__/navigation-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create tests proving:
- `parseNavigationState("?namespace=team-a&view=test-history&script=api%2Fsmoke.ts&report=api%2Fsmoke.ts-1.html&reportTab=note_1")` returns namespace `team-a`, view `test-history`, script `api/smoke.ts`, report `api/smoke.ts-1.html`, reportTab `note_1`.
- invalid view defaults to `editor`.
- `buildNavigationSearch` includes namespace changes even with no selected script.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/navigation-state.test.ts --runInBand`
Expected: FAIL because `@/lib/navigation-state` does not exist.

- [ ] **Step 3: Implement helper**

Create `MainView = "editor" | "live-dashboard" | "test-history"`, `SUMMARY_REPORT_TAB_ID = "summary"`, `parseNavigationState`, and `buildNavigationSearch`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/navigation-state.test.ts --runInBand`
Expected: PASS.

### Task 2: AppShell URL Sync

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Test: `src/components/layout/__tests__/AppShell.test.tsx`

- [ ] **Step 1: Write failing AppShell tests**

Add tests proving:
- Initial URL query hydrates namespace, selected script, selected main view, report, and report tab.
- Selecting a script updates `script` in the URL.
- Switching main tabs updates `view`.
- Changing namespace updates `namespace` and clears script/report context.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/layout/__tests__/AppShell.test.tsx --runInBand`
Expected: FAIL because AppShell currently ignores the URL.

- [ ] **Step 3: Implement AppShell sync**

Add state for `activeView`, `selectedReport`, and `activeReportTab`. On mount, read URL state first, then localStorage namespace fallback. On state changes after mount, update the current URL with `window.history.replaceState`. Make `<Tabs>` controlled with `value={activeView}` and `onValueChange`.

- [ ] **Step 4: Run AppShell test**

Run: `npx jest src/components/layout/__tests__/AppShell.test.tsx --runInBand`
Expected: PASS.

### Task 3: History Report And Tab URL Callbacks

**Files:**
- Modify: `src/components/tabs/TestHistoryTab.tsx`
- Modify: `src/components/tabs/TestHistoryReportPreview.tsx`
- Test: `src/components/tabs/__tests__/TestHistoryTab.test.tsx`
- Test: `src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx`

- [ ] **Step 1: Write failing controlled-state tests**

Add tests proving:
- `TestHistoryTab` can receive `selectedReportName` and calls `onSelectedReportChange` when a report is clicked.
- `TestHistoryReportPreview` can receive `activeTabId` and calls `onActiveTabChange` when summary, a note, or a new note is selected.

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `npx jest src/components/tabs/__tests__/TestHistoryTab.test.tsx --runInBand`
- `npx jest src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx --runInBand`

Expected: FAIL because controlled props do not exist.

- [ ] **Step 3: Implement controlled props**

In `TestHistoryTab`, support `selectedReportName` and `onSelectedReportChange` while preserving internal state for existing usage. In `TestHistoryReportPreview`, support `activeTabId` and `onActiveTabChange` while preserving internal state for existing usage.

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `npx jest src/components/tabs/__tests__/TestHistoryTab.test.tsx --runInBand`
- `npx jest src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx --runInBand`

Expected: PASS.

### Task 4: Full Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run focused tests**

Run:
- `npx jest src/lib/__tests__/navigation-state.test.ts --runInBand`
- `npx jest src/components/layout/__tests__/AppShell.test.tsx --runInBand`
- `npx jest src/components/tabs/__tests__/TestHistoryTab.test.tsx --runInBand`
- `npx jest src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:
- `npx jest --runInBand`
- `npm run lint`
- `npm run build`
- `npx tsc --noEmit`

Expected: all exit 0.

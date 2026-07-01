# Namespace Management Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move namespace create/rename/delete actions out of the quick selector dropdown into a dedicated manage namespace menu.

**Architecture:** Keep `NamespaceSelector` responsible for the compact header selector and add an in-component management dialog. Extend `/api/namespaces` with a rename method that moves namespace-prefixed script and report objects so saved history remains reachable after renaming.

**Tech Stack:** Next.js App Router route handlers, MinIO client, React 19, TypeScript strict mode, Jest + React Testing Library.

---

### Task 1: Namespace API Rename

**Files:**
- Modify: `src/app/api/namespaces/route.ts`
- Modify: `src/app/api/namespaces/__tests__/route.test.ts`

- [ ] **Step 1: Write failing API tests**
  - Add tests for `PATCH /api/namespaces` with `{ from, to }`.
  - Verify it copies/removes script and report objects from `old/` to `new/`.
  - Verify it rejects renaming `default`.
  - Verify it rejects rename when the target namespace already exists.

- [ ] **Step 2: Run focused API tests**
  - Run: `npx jest src/app/api/namespaces/__tests__/route.test.ts --runInBand`
  - Expected: fail because `PATCH` does not exist.

- [ ] **Step 3: Implement namespace rename**
  - Export `PATCH` from `src/app/api/namespaces/route.ts`.
  - Validate source and destination namespaces with `normalizeNamespace`.
  - Reject `default` as a source or target.
  - Reject when target prefix already contains objects.
  - Copy every object from `old/` to `new/` in both scripts and reports buckets, then remove old objects.

- [ ] **Step 4: Re-run focused API tests**
  - Run: `npx jest src/app/api/namespaces/__tests__/route.test.ts --runInBand`
  - Expected: pass.

### Task 2: Selector Dropdown And Manager Dialog

**Files:**
- Modify: `src/components/layout/NamespaceSelector.tsx`
- Modify: `src/components/layout/__tests__/NamespaceSelector.test.tsx`

- [ ] **Step 1: Write failing UI tests**
  - Assert the quick dropdown has no inline delete button.
  - Assert the quick dropdown has a `Manage namespaces` button below the list.
  - Assert the manager can create a namespace.
  - Assert the manager can rename a non-default namespace.
  - Assert the manager can delete an empty non-default namespace.

- [ ] **Step 2: Run focused UI tests**
  - Run: `npx jest src/components/layout/__tests__/NamespaceSelector.test.tsx --runInBand`
  - Expected: fail because the manager does not exist yet.

- [ ] **Step 3: Implement manager UI**
  - Remove quick dropdown delete controls.
  - Add a footer `Manage namespaces` button inside the dropdown.
  - Reuse the existing dialog primitives for a namespace management dialog.
  - Move create into the manager.
  - Add per-row rename and delete controls in the manager.

- [ ] **Step 4: Re-run focused UI tests**
  - Run: `npx jest src/components/layout/__tests__/NamespaceSelector.test.tsx --runInBand`
  - Expected: pass.

### Task 3: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused related tests**
  - Run: `npx jest src/app/api/namespaces/__tests__/route.test.ts src/components/layout/__tests__/NamespaceSelector.test.tsx --runInBand`

- [ ] **Step 2: Run full suite and static checks**
  - Run: `npx jest --runInBand`
  - Run: `npx tsc --noEmit`
  - Run: `npm run lint`
  - Run: `npm run build`
  - Run: `git diff --check`

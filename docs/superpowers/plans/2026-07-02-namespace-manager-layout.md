# Namespace Manager Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the namespace management modal layout and change rename to pencil-triggered inline title editing.

**Architecture:** Keep namespace management inside `NamespaceSelector`. The quick selector remains read-only/select-only; the manager dialog contains create, scrollable namespace list, inline rename, and delete confirmation.

**Tech Stack:** React 19, Testing Library, Jest, Tailwind CSS classes, existing shadcn-style `Button`, `Input`, and `Dialog` primitives.

---

### Task 1: Inline Rename And Scroll Layout

**Files:**
- Modify: `src/components/layout/NamespaceSelector.tsx`
- Test: `src/components/layout/__tests__/NamespaceSelector.test.tsx`

- [x] **Step 1: Write failing tests**

Add tests proving:
- namespace rows do not show rename inputs by default
- a pencil/edit button makes the title editable
- cancel exits edit mode without calling `PATCH`
- save calls `PATCH`
- the namespace list has a dedicated scroll container

Run: `npx jest src/components/layout/__tests__/NamespaceSelector.test.tsx --runInBand`
Expected: FAIL because the current modal renders rename inputs immediately and has no dedicated scroll test id.

- [x] **Step 2: Implement minimal component changes**

In `NamespaceSelector.tsx`:
- Add edit state for the currently edited namespace.
- Replace always-visible rename input with read-only title plus pencil button.
- When editing, render an input in place of the title with check and x icon buttons.
- Keep delete outside rename editing.
- Add a height-bounded dialog body and a `data-testid="namespace-management-list"` scroll area around namespace rows.
- Make rows responsive so actions wrap instead of overlapping.

- [x] **Step 3: Verify focused tests**

Run: `npx jest src/components/layout/__tests__/NamespaceSelector.test.tsx --runInBand`
Expected: PASS.

- [x] **Step 4: Run full verification**

Run:
- `npx jest --runInBand`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all commands exit 0.

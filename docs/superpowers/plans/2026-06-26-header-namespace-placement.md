# Header Namespace Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the namespace selector next to the k6 Studio identity on the left side of the header.

**Architecture:** Keep `NamespaceSelector` unchanged and only adjust the composition inside `AppHeader`. Add one component test that asserts DOM order so the layout intent cannot regress silently.

**Tech Stack:** React 19, Next.js App Router, TypeScript, Tailwind CSS 4, Jest, React Testing Library.

---

### Task 1: Header Namespace Layout

**Files:**
- Modify: `src/components/layout/AppHeader.tsx`
- Modify: `src/components/layout/__tests__/AppHeader.test.tsx`

- [ ] **Step 1: Write the failing DOM-order test**

Add this test to `src/components/layout/__tests__/AppHeader.test.tsx`:

```tsx
  it("places the namespace selector beside the app identity before runner status", () => {
    render(
      <AppHeader
        namespace="team-a"
        onNamespaceChange={jest.fn()}
        activeRunners={0}
        runningScript={null}
      />
    );

    const header = screen.getByRole("banner");
    const namespaceControl = screen.getByRole("button", {
      name: "namespace:team-a",
    });
    const runnerStatus = screen.getByTestId("active-runner-status");
    const nodes = Array.from(header.querySelectorAll("*"));

    expect(nodes.indexOf(namespaceControl)).toBeGreaterThan(-1);
    expect(nodes.indexOf(runnerStatus)).toBeGreaterThan(-1);
    expect(nodes.indexOf(namespaceControl)).toBeLessThan(
      nodes.indexOf(runnerStatus)
    );
    expect(namespaceControl.closest("[data-testid='app-header-left']")).not.toBeNull();
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx jest src/components/layout/__tests__/AppHeader.test.tsx --runInBand
```

Expected: the new test fails because `data-testid="app-header-left"` does not exist and the namespace selector is still in the right-side controls.

- [ ] **Step 3: Move the selector into the left header group**

In `src/components/layout/AppHeader.tsx`, wrap the logo/title and namespace selector in a left-side group:

```tsx
<div data-testid="app-header-left" className="flex min-w-0 items-center gap-3">
  <div className="flex shrink-0 items-center gap-2">
    <K6Logo className="h-7 w-7" />
    <div className="leading-tight">
      <p className="text-sm font-semibold tracking-tight text-foreground">
        k6 Studio
      </p>
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Load lab
      </p>
    </div>
  </div>

  <div className="h-6 w-px bg-border" aria-hidden />
  <NamespaceSelector
    namespace={namespace}
    onNamespaceChange={onNamespaceChange}
  />
</div>
```

Keep the active runner controls in the existing right-side `ml-auto` group:

```tsx
<div className="ml-auto flex min-w-0 items-center gap-3">
  <div data-testid="active-runner-status">...</div>
  {isRunning && runningScript && <span>...</span>}
</div>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npx jest src/components/layout/__tests__/AppHeader.test.tsx --runInBand
```

Expected: all `AppHeader` tests pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
npx jest --runInBand
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-06-26-header-namespace-placement-design.md docs/superpowers/plans/2026-06-26-header-namespace-placement.md src/components/layout/AppHeader.tsx src/components/layout/__tests__/AppHeader.test.tsx
git commit -m "fix: move namespace selector beside app title"
```

# k6 Studio Web

k6 Studio Web is a browser-based workspace for writing, organizing, running, and
reviewing k6 load tests. It brings scripts, folders, namespaces, the editor,
script builder, terminal output, live dashboard, and saved reports into one
compact UI.

![k6 Studio Web workspace](images/guide-workspace.png)

## What You Can Do

- Manage k6 scripts and folders in a namespace-aware file explorer.
- Edit TypeScript k6 scripts in the browser.
- Generate starter scripts with the visual Script Builder.
- Run k6 from the UI and watch terminal output as it streams.
- Open the k6 live dashboard for the currently running script.
- Review saved reports and attach Markdown notes with pasted images.
- Share URLs that preserve namespace, selected script, active view, report, and
  report tab context.

## Start The App

Run the full local stack:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:3000/k6
```

The root URL redirects to `/k6`.

For local development without Docker:

```bash
npm install
npm run dev
```

## Product Workflow

### 1. Choose A Namespace

Use the namespace selector in the header to switch workspaces. A namespace owns
its scripts, folders, reports, and notes. Use it to separate teams,
environments, or test suites.

Open **Manage namespaces** from the selector to create, rename, or delete
namespaces. The `default` namespace is protected.

### 2. Find Or Create Scripts

Use the left file explorer to create folders, create scripts, search files,
drag/drop items, and bulk-select files or folders.

Example structure:

```text
checkout/smoke-checkout.ts
checkout/peak-checkout.ts
api/auth-flow.ts
```

### 3. Edit And Run

Open a script, adjust it in the editor, save it, then click **Run test**. During
a run, the terminal panel streams k6 output and the header shows active runner
capacity.

Use **Cancel run** to stop an active k6 process. Cancelled runs are not saved to
history.

### 4. Build Scripts Visually

The **Builder** tab helps you compose a k6 script from form controls.

![Script Builder](images/guide-builder.png)

Use it to configure:

- target host
- load stages
- thresholds
- REST or GraphQL scenario steps
- request body/header samples

Click **Apply to Editor** to move the generated script into the editor.

### 5. Watch The Live Dashboard

Open **Live dashboard** while a script is running to view the k6 web dashboard
inside the app.

![Live dashboard](images/guide-live-dashboard.png)

If another script is running, click the active runner label in the header and
jump to that script.

### 6. Review History And Notes

After a run finishes, open **Test history** for the selected script.

![Test history](images/guide-history.png)

Each report has a pinned summary tab. You can also add Markdown note tabs for
release observations, threshold decisions, follow-up tasks, links, or pasted
images.

## Tips

- Keep smoke scripts short and create separate peak, soak, or stress scripts.
- Put important thresholds directly in scripts so pass/fail signals are clear.
- Use folders for scenario groups such as `checkout/`, `search/`, and `api/`.
- Use namespaces to isolate experimental scripts from stable scripts.
- Save investigation notes on the report so context stays with the result.

## Configuration

S3-compatible storage settings:

```text
AWS_S3_BUCKET
AWS_S3_ENDPOINT
AWS_S3_ACCESS_KEY
AWS_S3_SECRET_KEY
AWS_S3_USE_SSL
```

Runner capacity:

```text
TOTAL_RUNNERS
```

`TOTAL_RUNNERS` defaults to `1` and supports up to `20`.

Runtime notes:

- The app uses the fixed base path `/k6`.
- Docker images include the k6 binary.
- Dashboard ports are allocated from `5665` through `5684`.

## Common Issues

### Scripts Do Not Load

Confirm MinIO or your S3-compatible service is reachable and the `AWS_S3_*`
environment variables match the runtime environment.

### Live Dashboard Is Empty

The live dashboard only appears while the selected script is actively running.
Use the active runner menu to jump to the running script.

### Run Cannot Start

All runners may be busy. Wait for a runner to finish or increase
`TOTAL_RUNNERS`.

### Pod Restarts During A Run

k6 can use meaningful memory during active load tests. Check Kubernetes memory
limits and raise them if the container is OOM-killed.

## Developer Commands

```bash
npm run dev
npm run build
npm run lint
npx jest
npx tsc --noEmit
docker compose up --build -d
```

## Refresh README Screenshots

Screenshots are generated with local Playwright:

```bash
node scripts/capture-guide-screenshots.mjs
```

The script starts a temporary dev server, mocks deterministic app data, writes
fresh `images/guide-*.png` files, and shuts the server down automatically.

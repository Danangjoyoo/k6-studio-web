# Task 2: MinIO Storage Layer

> [← Master Plan](./master.md)

**Goal:** Create the MinIO client singleton, bucket initialisation helpers, and all API routes for file CRUD (list, read, write, delete) and report listing. This is the data layer all UI tasks depend on.

**Files:**
- Create: `src/lib/minio.ts`
- Create: `src/app/api/files/route.ts`
- Create: `src/app/api/files/[name]/route.ts`
- Create: `src/app/api/reports/route.ts`
- Create: `src/app/api/reports/[name]/route.ts`
- Create: `src/lib/__tests__/minio.test.ts`
- Create: `jest.config.ts`

**Interfaces produced (consumed by later tasks):**

```ts
// GET /api/files → { files: { name: string; size: number; lastModified: string }[] }
// POST /api/files → body: { name: string; content: string } → 201 { name: string }
// GET /api/files/[name] → { name: string; content: string }
// PUT /api/files/[name] → body: { content: string } → 200 { name: string }
// DELETE /api/files/[name] → 204

// GET /api/reports → { reports: { name: string; size: number; lastModified: string }[] }
// GET /api/reports/[name] → HTML string (Content-Type: text/html)
```

---

- [ ] **Step 1: Install jest for Next.js**

```bash
npm install -D jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom ts-jest
```

Create `jest.config.ts` at project root:

```ts
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default config;
```

- [ ] **Step 2: Write failing test for MinIO client**

Create `src/lib/__tests__/minio.test.ts`:

```ts
import { getMinioClient } from "@/lib/minio";

describe("minio", () => {
  it("getMinioClient returns a Client instance", () => {
    const client = getMinioClient();
    expect(client).toBeDefined();
    expect(typeof client.listObjects).toBe("function");
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npx jest src/lib/__tests__/minio.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/minio'`

- [ ] **Step 4: Implement `src/lib/minio.ts`**

```ts
import { Client } from "minio";

let client: Client | null = null;

export function getMinioClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    });
  }
  return client;
}

export const SCRIPTS_BUCKET = "k6-scripts";
export const REPORTS_BUCKET = "k6-reports";

export async function ensureBuckets(): Promise<void> {
  const c = getMinioClient();
  for (const bucket of [SCRIPTS_BUCKET, REPORTS_BUCKET]) {
    const exists = await c.bucketExists(bucket);
    if (!exists) {
      await c.makeBucket(bucket, "us-east-1");
    }
  }
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
npx jest src/lib/__tests__/minio.test.ts
```

Expected: PASS

- [ ] **Step 6: Implement `src/app/api/files/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";

export async function GET() {
  await ensureBuckets();
  const client = getMinioClient();
  const stream = client.listObjects(SCRIPTS_BUCKET, "", false);
  const files: { name: string; size: number; lastModified: string }[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name) {
        files.push({
          name: obj.name,
          size: obj.size ?? 0,
          lastModified: obj.lastModified?.toISOString() ?? "",
        });
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  await ensureBuckets();
  const { name, content } = (await request.json()) as {
    name: string;
    content: string;
  };

  if (!name || typeof content !== "string") {
    return NextResponse.json(
      { error: "name and content required" },
      { status: 400 }
    );
  }

  const client = getMinioClient();
  const buffer = Buffer.from(content, "utf-8");
  await client.putObject(SCRIPTS_BUCKET, name, buffer, buffer.length, {
    "Content-Type": "text/plain",
  });

  return NextResponse.json({ name }, { status: 201 });
}
```

- [ ] **Step 7: Implement `src/app/api/files/[name]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureBuckets();
  const { name } = await params;
  const client = getMinioClient();
  try {
    const stream = await client.getObject(SCRIPTS_BUCKET, name);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return NextResponse.json({
      name,
      content: Buffer.concat(chunks).toString("utf-8"),
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  await ensureBuckets();
  const { name } = await params;
  const { content } = (await request.json()) as { content: string };
  const client = getMinioClient();
  const buffer = Buffer.from(content, "utf-8");
  await client.putObject(SCRIPTS_BUCKET, name, buffer, buffer.length, {
    "Content-Type": "text/plain",
  });
  return NextResponse.json({ name });
}

export async function DELETE(_req: Request, { params }: Params) {
  await ensureBuckets();
  const { name } = await params;
  const client = getMinioClient();
  await client.removeObject(SCRIPTS_BUCKET, name);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 8: Implement `src/app/api/reports/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";

export async function GET() {
  await ensureBuckets();
  const client = getMinioClient();
  const stream = client.listObjects(REPORTS_BUCKET, "", false);
  const reports: { name: string; size: number; lastModified: string }[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name) {
        reports.push({
          name: obj.name,
          size: obj.size ?? 0,
          lastModified: obj.lastModified?.toISOString() ?? "",
        });
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return NextResponse.json({ reports });
}
```

- [ ] **Step 9: Implement `src/app/api/reports/[name]/route.ts`**

```ts
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureBuckets();
  const { name } = await params;
  const client = getMinioClient();
  try {
    const stream = await client.getObject(REPORTS_BUCKET, name);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return new Response(Buffer.concat(chunks).toString("utf-8"), {
      headers: { "Content-Type": "text/html" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
```

- [ ] **Step 10: Integration-test API with MinIO running**

```bash
docker compose up minio -d
sleep 3
npm run dev &
sleep 5

curl -X POST http://localhost:3000/api/files \
  -H "Content-Type: application/json" \
  -d '{"name":"hello.js","content":"import http from \"k6/http\";"}'
# Expected: {"name":"hello.js"} status 201

curl http://localhost:3000/api/files
# Expected: {"files":[{"name":"hello.js","size":...,"lastModified":"..."}]}

curl http://localhost:3000/api/files/hello.js
# Expected: {"name":"hello.js","content":"import http from \"k6/http\";"}

curl -X DELETE http://localhost:3000/api/files/hello.js
# Expected: 204 No Content
```

- [ ] **Step 11: Stop services and commit**

```bash
kill %1
docker compose down
git add src/lib/ src/app/api/ jest.config.ts
git commit -m "feat: add MinIO storage layer with file and report API routes"
```

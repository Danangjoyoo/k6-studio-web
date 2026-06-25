import { KEEP_SUFFIX } from "@/lib/files-tree";
import { REPORTS_BUCKET, SCRIPTS_BUCKET } from "@/lib/minio";

export interface MoveItem {
  path: string;
  type: "file" | "folder";
}

export interface ObjectMove {
  from: string;
  to: string;
}

export interface MovePlan {
  scriptObjectMoves: ObjectMove[];
  reportObjectMoves: ObjectMove[];
}

interface BuildMovePlanInput {
  items: MoveItem[];
  targetFolder: string;
  existingScriptObjectKeys: string[];
  existingReportObjectKeys: string[];
  activeRunningScript?: string | null;
}

interface NormalizedMoveItem extends MoveItem {
  path: string;
  name: string;
}

interface MoveClient {
  copyObject(bucketName: string, objectName: string, sourceObject: string): Promise<unknown>;
  removeObjects(bucketName: string, objectsList: string[]): Promise<unknown>;
}

export class MoveConflictError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "MoveConflictError";
  }
}

export function buildMovePlan(input: BuildMovePlanInput): MovePlan {
  const items = normalizeItems(input.items);
  const targetFolder = normalizeFolderPath(input.targetFolder);
  const scriptKeys = input.existingScriptObjectKeys.map(normalizeObjectKey);
  const reportKeys = input.existingReportObjectKeys.map(normalizeObjectKey);
  const scriptKeySet = new Set(scriptKeys);
  const reportKeySet = new Set(reportKeys);
  const runningScript = input.activeRunningScript
    ? normalizeObjectPath(input.activeRunningScript, "active running script")
    : null;

  rejectRedundantNestedSelections(items);

  const destinationNames = new Set<string>();
  for (const item of items) {
    const destinationNameKey = `${targetFolder}\0${item.name}`;
    if (destinationNames.has(destinationNameKey)) {
      throw new MoveConflictError(`Duplicate destination name: ${item.name}`, 409);
    }
    destinationNames.add(destinationNameKey);

    if (item.type === "folder" && isFolderInsideItself(item.path, targetFolder)) {
      throw new MoveConflictError(
        "Cannot move a folder into itself or its descendants",
        400
      );
    }

    rejectRunningScriptMove(item, runningScript);
  }

  const scriptObjectMoves: ObjectMove[] = [];
  const scriptFilePathMoves: ObjectMove[] = [];

  for (const item of items) {
    if (item.type === "file") {
      if (!scriptKeySet.has(item.path)) {
        throw new MoveConflictError(`Source file not found: ${item.path}`, 404);
      }

      const destination = joinObjectPath(targetFolder, item.name);
      if (targetNameExists(targetFolder, item.name, scriptKeys)) {
        throw new MoveConflictError(`Destination already exists: ${destination}`, 409);
      }

      scriptObjectMoves.push({ from: item.path, to: destination });
      scriptFilePathMoves.push({ from: item.path, to: destination });
      continue;
    }

    const sourcePrefix = folderPrefix(item.path);
    const folderObjects = scriptKeys.filter((key) => key.startsWith(sourcePrefix));
    if (folderObjects.length === 0) {
      throw new MoveConflictError(`Source folder not found: ${item.path}`, 404);
    }

    const destinationFolder = joinObjectPath(targetFolder, item.name);
    if (targetNameExists(targetFolder, item.name, scriptKeys)) {
      throw new MoveConflictError(`Destination already exists: ${destinationFolder}`, 409);
    }

    const destinationPrefix = folderPrefix(destinationFolder);
    for (const sourceKey of folderObjects) {
      const destination = `${destinationPrefix}${sourceKey.slice(sourcePrefix.length)}`;
      scriptObjectMoves.push({ from: sourceKey, to: destination });
      if (!sourceKey.endsWith(KEEP_SUFFIX)) {
        scriptFilePathMoves.push({ from: sourceKey, to: destination });
      }
    }
  }

  const reportObjectMoves = buildReportMoves(
    scriptFilePathMoves,
    reportKeys,
    reportKeySet
  );

  return { scriptObjectMoves, reportObjectMoves };
}

export async function executeMovePlan(
  client: MoveClient,
  plan: MovePlan
): Promise<void> {
  for (const move of plan.scriptObjectMoves) {
    await client.copyObject(SCRIPTS_BUCKET, move.to, `/${SCRIPTS_BUCKET}/${move.from}`);
  }
  for (const move of plan.reportObjectMoves) {
    await client.copyObject(REPORTS_BUCKET, move.to, `/${REPORTS_BUCKET}/${move.from}`);
  }

  if (plan.scriptObjectMoves.length > 0) {
    await client.removeObjects(
      SCRIPTS_BUCKET,
      plan.scriptObjectMoves.map((move) => move.from)
    );
  }
  if (plan.reportObjectMoves.length > 0) {
    await client.removeObjects(
      REPORTS_BUCKET,
      plan.reportObjectMoves.map((move) => move.from)
    );
  }
}

function normalizeItems(items: MoveItem[]): NormalizedMoveItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new MoveConflictError("items must be a non-empty array", 400);
  }

  return items.map((item) => {
    if (
      !item ||
      (item.type !== "file" && item.type !== "folder") ||
      typeof item.path !== "string"
    ) {
      throw new MoveConflictError("items must include path and type", 400);
    }

    const path =
      item.type === "folder"
        ? normalizeFolderPath(item.path)
        : normalizeObjectPath(item.path, "path");
    if (!path) {
      throw new MoveConflictError("item path required", 400);
    }
    if (item.type === "file" && path.endsWith(KEEP_SUFFIX)) {
      throw new MoveConflictError("Cannot move folder sentinels as files", 400);
    }

    return {
      path,
      type: item.type,
      name: baseName(path),
    };
  });
}

function normalizeObjectKey(key: string): string {
  return normalizePathParts(key).join("/");
}

function normalizeObjectPath(path: string, label: string): string {
  const normalized = normalizeObjectKey(path);
  if (!normalized) {
    throw new MoveConflictError(`${label} required`, 400);
  }
  return normalized;
}

function normalizeFolderPath(path: string): string {
  if (typeof path !== "string") {
    throw new MoveConflictError("targetFolder required", 400);
  }
  return normalizePathParts(path).join("/");
}

function normalizePathParts(path: string): string[] {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => {
      if (part === "." || part === "..") {
        throw new MoveConflictError("Invalid path", 400);
      }
      return part;
    });
}

function rejectRedundantNestedSelections(items: NormalizedMoveItem[]) {
  for (const folder of items.filter((item) => item.type === "folder")) {
    const prefix = folderPrefix(folder.path);
    for (const item of items) {
      if (item === folder) continue;
      if (item.path.startsWith(prefix)) {
        throw new MoveConflictError(
          "Cannot move a folder and one of its children in the same request",
          400
        );
      }
    }
  }
}

function rejectRunningScriptMove(
  item: NormalizedMoveItem,
  runningScript: string | null
) {
  if (!runningScript) return;

  if (item.type === "file" && item.path === runningScript) {
    throw new MoveConflictError("Cannot move a script while it is running", 409);
  }

  if (item.type === "folder" && runningScript.startsWith(folderPrefix(item.path))) {
    throw new MoveConflictError(
      "Cannot move a folder containing the running script",
      409
    );
  }
}

function isFolderInsideItself(sourceFolder: string, targetFolder: string): boolean {
  return targetFolder === sourceFolder || targetFolder.startsWith(folderPrefix(sourceFolder));
}

function targetNameExists(
  targetFolder: string,
  name: string,
  scriptKeys: string[]
): boolean {
  const destination = joinObjectPath(targetFolder, name);
  const destinationFolderPrefix = folderPrefix(destination);
  return scriptKeys.some(
    (key) => key === destination || key.startsWith(destinationFolderPrefix)
  );
}

function buildReportMoves(
  scriptFilePathMoves: ObjectMove[],
  reportKeys: string[],
  reportKeySet: Set<string>
): ObjectMove[] {
  const reportObjectMoves: ObjectMove[] = [];
  const reportDestinations = new Set<string>();

  for (const scriptMove of scriptFilePathMoves) {
    const oldPrefix = `${scriptMove.from}-`;
    for (const reportKey of reportKeys) {
      if (!reportKey.startsWith(oldPrefix)) continue;

      const destination = `${scriptMove.to}${reportKey.slice(scriptMove.from.length)}`;
      if (reportKeySet.has(destination)) {
        throw new MoveConflictError(
          `Destination report already exists: ${destination}`,
          409
        );
      }
      if (reportDestinations.has(destination)) {
        throw new MoveConflictError(
          `Duplicate destination report name: ${destination}`,
          409
        );
      }
      reportDestinations.add(destination);
      reportObjectMoves.push({ from: reportKey, to: destination });
    }
  }

  return reportObjectMoves;
}

function joinObjectPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

function folderPrefix(path: string): string {
  return `${path.replace(/\/+$/, "")}/`;
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

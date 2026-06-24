/** Sentinel suffix used to mark an empty folder in MinIO. */
export const KEEP_SUFFIX = "/.keep";

export interface FileNode {
  path: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
}

/**
 * Build a tree from a flat list of MinIO object keys.
 * Folder sentinels (`.../.keep`) are filtered; their parent dirs are
 * synthesised as folder nodes.
 */
export function buildTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();

  function getOrCreateFolder(segmentPath: string, parts: string[], current: FileNode[]): FileNode {
    let folder = folderMap.get(segmentPath);
    if (!folder) {
      const name = parts[parts.length - 1];
      folder = { path: segmentPath + "/", name, type: "folder", children: [] };
      folderMap.set(segmentPath, folder);
      current.push(folder);
    }
    return folder;
  }

  for (const fullPath of paths) {
    const isKeep = fullPath.endsWith(KEEP_SUFFIX);

    const parts = fullPath.split("/");

    // For sentinel files, synthesise the parent folder but don't add the
    // `.keep` file itself.
    const fileCount = isKeep ? parts.length - 1 : parts.length;
    let current = root;

    for (let i = 0; i < fileCount; i++) {
      const isLast = i === fileCount - 1;
      const segmentPath = parts.slice(0, i + 1).join("/");

      if (isLast && !isKeep) {
        current.push({ path: fullPath, name: parts[i], type: "file" });
      } else if (!isLast || isKeep) {
        const folder = getOrCreateFolder(segmentPath, parts.slice(0, i + 1), current);
        current = folder.children!;
      }
    }
  }

  return root;
}

export function getLinesToAppend(
  lines: string[],
  writtenCount: number
): string[] {
  if (writtenCount >= lines.length) return [];
  return lines.slice(writtenCount);
}

export interface ResetTerminalInput {
  prevCount: number;
  nextCount: number;
  prevKey: string | undefined;
  nextKey: string | undefined;
}

export function shouldResetTerminal({
  prevCount,
  nextCount,
  prevKey,
  nextKey,
}: ResetTerminalInput): boolean {
  if (prevKey !== nextKey) return true;
  if (prevCount > 0 && nextCount === 0) return true;
  return false;
}

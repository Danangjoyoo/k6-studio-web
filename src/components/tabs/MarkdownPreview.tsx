"use client";

import type { ReactNode } from "react";

interface MarkdownPreviewProps {
  markdown: string;
}

export default function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  return (
    <div className="prose prose-invert max-w-none space-y-3 text-sm text-foreground">
      {renderBlocks(markdown)}
    </div>
  );
}

function renderBlocks(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre
          key={`block-${key++}`}
          className="overflow-auto rounded-md border border-border bg-panel-raised p-3 font-mono text-xs"
        >
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `heading-${key}`);
      if (level === 1) {
        blocks.push(
          <h1 key={`block-${key++}`} className="text-xl font-semibold">
            {content}
          </h1>
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={`block-${key++}`} className="text-lg font-semibold">
            {content}
          </h2>
        );
      } else {
        blocks.push(
          <h3 key={`block-${key++}`} className="text-base font-semibold">
            {content}
          </h3>
        );
      }
      index += 1;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^-\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`block-${key++}`} className="list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>
              {renderInline(item, `list-${key}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !lines[index]?.startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[index] ?? "") &&
      !/^-\s+/.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(
      <p key={`block-${key++}`} className="leading-6 text-muted-foreground">
        {renderInline(paragraph.join(" "), `paragraph-${key}`)}
      </p>
    );
  }

  if (blocks.length === 0) {
    return [
      <p key="empty" className="text-sm text-muted-foreground">
        Nothing to preview.
      </p>,
    ];
  }
  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }

    if (match[1] !== undefined && match[2]) {
      const src = safeResourceUrl(match[2]);
      if (src) {
        parts.push(
          // Markdown images can point to arbitrary pasted note assets.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${keyPrefix}-inline-${key++}`}
            src={src}
            alt={match[1]}
            className="max-h-96 rounded-md border border-border bg-white"
          />
        );
      } else {
        parts.push(match[0]);
      }
    } else if (match[3] !== undefined && match[4]) {
      const href = safeResourceUrl(match[4]);
      if (href) {
        parts.push(
          <a
            key={`${keyPrefix}-inline-${key++}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {match[3]}
          </a>
        );
      } else {
        parts.push(match[3]);
      }
    } else if (match[5] !== undefined) {
      parts.push(
        <code
          key={`${keyPrefix}-inline-${key++}`}
          className="rounded bg-panel-raised px-1 py-0.5 font-mono text-xs"
        >
          {match[5]}
        </code>
      );
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

function safeResourceUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

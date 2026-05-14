import React from "react";

export function renderMarkdown(md: string): React.ReactNode {
  if (!md) return null;
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];
  let tableRows: string[][] = [];
  let tableHeader: string[] = [];

  function flushTable() {
    if (tableHeader.length === 0) return;
    out.push(
      <div key={`tbl-${out.length}`} className="my-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-cream-100">
              {tableHeader.map((h, i) => (
                <th key={i} className="border border-line px-3 py-2 text-left font-semibold">
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-cream-50"}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-line px-3 py-2">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableHeader = [];
    tableRows = [];
  }

  function flushList() {
    if (listBuffer.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc pl-6 my-2 space-y-1">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  function flushPara() {
    if (paraBuffer.length === 0) return;
    out.push(
      <p key={`p-${out.length}`} className="my-2 leading-relaxed">
        {renderInline(paraBuffer.join(" "))}
      </p>,
    );
    paraBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.trim() === "") {
      flushTable();
      flushList();
      flushPara();
      continue;
    }

    if (/^\|[\s-:|]+\|$/.test(line)) continue;

    const tableMatch = /^\|(.+)\|$/.exec(line);
    if (tableMatch) {
      flushList();
      flushPara();
      const cells = tableMatch[1]!.split("|").map((c) => c.trim());
      if (tableHeader.length === 0) {
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    }

    if (tableHeader.length > 0) flushTable();

    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    const bq = /^>\s+(.*)$/.exec(line);

    if (h1 || h2 || h3) {
      flushList();
      flushPara();
      if (h1) {
        out.push(
          <h1 key={`h-${out.length}`} className="display-tight text-2xl font-bold mt-4 mb-3">
            {renderInline(h1[1]!)}
          </h1>,
        );
      } else if (h2) {
        out.push(
          <h2 key={`h-${out.length}`} className="display-tight text-lg font-semibold mt-4 mb-2">
            {renderInline(h2[1]!)}
          </h2>,
        );
      } else if (h3) {
        out.push(
          <h3
            key={`h-${out.length}`}
            className="text-sm font-semibold uppercase tracking-wide text-ink-700 mt-3 mb-1"
          >
            {renderInline(h3[1]!)}
          </h3>,
        );
      }
      continue;
    }

    if (li) {
      flushPara();
      listBuffer.push(li[1]!);
      continue;
    }

    if (bq) {
      flushList();
      flushPara();
      out.push(
        <blockquote
          key={`bq-${out.length}`}
          className="border-l-4 border-teal-400 pl-3 py-1 my-2 text-ink-600 italic"
        >
          {renderInline(bq[1]!)}
        </blockquote>,
      );
      continue;
    }

    flushList();
    paraBuffer.push(line);
  }

  flushTable();
  flushList();
  flushPara();
  return out;
}

export function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns: Array<{ re: RegExp; render: (m: RegExpExecArray) => React.ReactNode }> = [
    {
      re: /`([^`]+)`/,
      render: (m) => (
        <code key={key++} className="bg-cream-200 rounded px-1 text-[0.85em]">
          {m[1]}
        </code>
      ),
    },
    { re: /\*\*([^*]+)\*\*/, render: (m) => <strong key={key++}>{m[1]}</strong> },
    { re: /\*([^*]+)\*/, render: (m) => <em key={key++}>{m[1]}</em> },
  ];

  while (remaining.length > 0) {
    let earliest: {
      match: RegExpExecArray;
      render: (m: RegExpExecArray) => React.ReactNode;
    } | null = null;
    for (const p of patterns) {
      const m = p.re.exec(remaining);
      if (m && (earliest === null || m.index < earliest.match.index)) {
        earliest = { match: m, render: p.render };
      }
    }
    if (!earliest) {
      parts.push(remaining);
      break;
    }
    if (earliest.match.index > 0) {
      parts.push(remaining.slice(0, earliest.match.index));
    }
    parts.push(earliest.render(earliest.match));
    remaining = remaining.slice(earliest.match.index + earliest.match[0].length);
  }

  return parts;
}

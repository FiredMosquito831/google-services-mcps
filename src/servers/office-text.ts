/**
 * Text of Office (docx, xlsx, pptx) and OpenDocument (odt, ods, odp) files, for drive_read_text. Drive exports only Google
 * Docs, Sheets and Slides; reading an Office file there would mean converting it into a new Google file (a write). So
 * the file is downloaded (a read) and its text is taken here: these formats are ZIP archives of XML parts. Pure
 * functions over the bytes, with node:zlib only. Old binary formats (doc, xls, ppt) are not read.
 */
import { inflateRawSync } from 'node:zlib';

export const OFFICE_TYPES: Record<string, 'docx' | 'xlsx' | 'pptx' | 'odt' | 'ods' | 'odp'> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
};

/** The most bytes one part of the archive may inflate to. Guards against a small file that unpacks to gigabytes. */
export const MAX_PART_BYTES = 64 * 1024 * 1024;

/** The parts of a ZIP archive by name, read lazily. Throws for a file that is not a ZIP archive. */
export function zipEntries(buf: Buffer): Map<string, () => Buffer> {
  // End of central directory: 22 bytes plus a comment of at most 65,535 bytes, at the end of the file.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('The file is not a ZIP archive, so it is not a readable Office or OpenDocument file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, () => Buffer>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The ZIP archive is damaged (central directory).');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.set(name, () => {
      if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`The ZIP archive is damaged (${name}).`);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compressed);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES });
      throw new Error(`${name} uses ZIP compression method ${method}, which is not read here.`);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? '';
  });
}

const tidy = (text: string): string => text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** Word: the text runs (w:t) of word/document.xml, a line per paragraph, tabs and breaks kept. */
function docxText(parts: Map<string, () => Buffer>): string {
  const xml = part(parts, 'word/document.xml');
  let out = '';
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g)) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0] === '</w:p>') out += '\n';
    else if (m[0].startsWith('<w:tab')) out += '\t';
    else out += '\n';
  }
  return tidy(out);
}

/** A column letter (A, Z, AA) as a 0-based index. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

const csvCell = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Excel: each sheet as CSV under "## Sheet: <name>", in workbook order, shared strings resolved. */
function xlsxText(parts: Map<string, () => Buffer>): string {
  const shared: string[] = [];
  if (parts.has('xl/sharedStrings.xml')) {
    for (const si of part(parts, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(decodeXml([...(si[1] ?? '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => t[1]).join('')));
    }
  }
  const rels = new Map<string, string>();
  if (parts.has('xl/_rels/workbook.xml.rels')) {
    for (const r of part(parts, 'xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /\bId="([^"]+)"/.exec(r[0])?.[1];
      const target = /\bTarget="([^"]+)"/.exec(r[0])?.[1];
      if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
    }
  }
  const sheets = [...part(parts, 'xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((s) => ({
    name: decodeXml(/\bname="([^"]*)"/.exec(s[0])?.[1] ?? ''),
    path: rels.get(/\br:id="([^"]+)"/.exec(s[0])?.[1] ?? '') ?? '',
  }));
  const blocks: string[] = [];
  for (const sheet of sheets) {
    if (!parts.has(sheet.path)) continue;
    const rows: string[] = [];
    for (const row of part(parts, sheet.path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? '';
        const body = c[2] ?? '';
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
        let value = '';
        if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = decodeXml([...body.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => t[1]).join(''));
        else if (type === 'b' && v !== undefined) value = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== undefined) value = decodeXml(v);
        const at = ref ? columnIndex(ref) : cells.length;
        while (cells.length < at) cells.push('');
        cells[at] = csvCell(value);
      }
      rows.push(cells.join(','));
    }
    blocks.push(`## Sheet: ${sheet.name}\n${rows.join('\n')}`);
  }
  return blocks.join('\n\n').trim();
}

/** PowerPoint: the text of each slide (a:t runs, a line per paragraph) under "## Slide <n>", in slide order. */
function pptxText(parts: Map<string, () => Buffer>): string {
  const slides = [...parts.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]));
  return slides
    .map((name, i) => {
      let out = '';
      for (const m of part(parts, name).matchAll(/<a:t>([^<]*)<\/a:t>|<\/a:p>|<a:br\b[^>]*\/>/g)) {
        if (m[1] !== undefined) out += decodeXml(m[1]);
        else out += '\n';
      }
      return `## Slide ${i + 1}\n${tidy(out)}`;
    })
    .join('\n\n')
    .trim();
}

/** OpenDocument: content.xml as text: a line per paragraph or heading; spreadsheets as tab-separated rows. */
function odfText(parts: Map<string, () => Buffer>, kind: 'odt' | 'ods' | 'odp'): string {
  let xml = part(parts, 'content.xml');
  xml = xml.replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_m, n: string | undefined) => ' '.repeat(Number(n ?? 1)));
  xml = xml.replace(/<text:tab\s*\/>/g, '\t').replace(/<text:line-break\s*\/>/g, '\n');
  if (kind === 'ods') {
    xml = xml.replace(/<table:table\b[^>]*table:name="([^"]*)"[^>]*>/g, '\n## Sheet: $1\n');
    // Paragraphs inside one cell are joined by a space; the cell's last paragraph ends with the cell.
    xml = xml.replace(/<\/text:p>(?=\s*<\/table:table-cell>)/g, '').replace(/<\/text:p>/g, ' ').replace(/<\/table:table-cell>|<table:table-cell\b[^>]*\/>/g, '\t').replace(/<\/table:table-row>/g, '\n');
  } else {
    if (kind === 'odp') {
      let n = 0;
      xml = xml.replace(/<draw:page\b[^>]*>/g, () => `\n## Slide ${++n}\n`);
    }
    xml = xml.replace(/<\/text:(p|h)>/g, '\n');
  }
  const text = decodeXml(xml.replace(/<[^>]+>/g, ''));
  return tidy(kind === 'ods' ? text.replace(/[ \t]+$/gm, '') : text);
}

function part(parts: Map<string, () => Buffer>, name: string): string {
  const read = parts.get(name);
  if (!read) throw new Error(`The file has no ${name}, so it is not a readable Office or OpenDocument file.`);
  return read().toString('utf8');
}

/** The text of an Office or OpenDocument file of the given content type. */
export function officeText(buf: Buffer, mimeType: string): string {
  const kind = OFFICE_TYPES[mimeType];
  if (!kind) throw new Error(`${mimeType} is not an Office or OpenDocument type read here.`);
  const parts = zipEntries(buf);
  if (kind === 'docx') return docxText(parts);
  if (kind === 'xlsx') return xlsxText(parts);
  if (kind === 'pptx') return pptxText(parts);
  return odfText(parts, kind);
}

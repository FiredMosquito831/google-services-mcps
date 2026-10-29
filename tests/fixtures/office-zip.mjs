// Builds small ZIP archives in memory for the Office and OpenDocument tests: each part stored or deflated, with a
// central directory, as a real archive has. CRC fields are written as computed by zlib.crc32 when Node has it (22+).
import zlib from 'node:zlib';

const crc = (buf) => (typeof zlib.crc32 === 'function' ? zlib.crc32(buf) : 0);

/** parts: [{ name, text, deflate? }] */
export function zipOf(parts) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name, 'utf8');
    const raw = Buffer.from(part.text, 'utf8');
    const data = part.deflate ? zlib.deflateRawSync(raw) : raw;
    const method = part.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc(raw), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const docx = () =>
  zipOf([
    { name: '[Content_Types].xml', text: '<Types/>' },
    {
      name: 'word/document.xml',
      deflate: true,
      text: '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world &amp; co</w:t></w:r></w:p><w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p></w:body></w:document>',
    },
  ]);

export const xlsx = () =>
  zipOf([
    { name: 'xl/workbook.xml', text: '<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>' },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    },
    { name: 'xl/sharedStrings.xml', text: '<sst><si><t>Item</t></si><si><t>Cost</t></si><si><r><t>Rent,</t></r><r><t> flat</t></r></si></sst>' },
    {
      name: 'xl/worksheets/sheet1.xml',
      deflate: true,
      text: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>950.5</v></c></row><row r="3"><c r="A3" t="b"><v>1</v></c><c r="B3" t="inlineStr"><is><t>x &lt; y</t></is></c></row></sheetData></worksheet>',
    },
    { name: 'xl/worksheets/sheet2.xml', text: '<worksheet><sheetData><row r="1"><c r="B1" t="str"><v>Total</v></c></row></sheetData></worksheet>' },
  ]);

export const pptx = () =>
  zipOf([
    { name: 'ppt/slides/slide10.xml', text: '<p:sld><a:p><a:r><a:t>Tenth</a:t></a:r></a:p></p:sld>' },
    { name: 'ppt/slides/slide2.xml', text: '<p:sld><a:p><a:r><a:t>Second</a:t></a:r><a:br/><a:r><a:t>line</a:t></a:r></a:p></p:sld>' },
    { name: 'ppt/slides/slide1.xml', deflate: true, text: '<p:sld><a:p><a:r><a:t>Title</a:t></a:r></a:p><a:p><a:r><a:t>Point</a:t></a:r></a:p></p:sld>' },
  ]);

export const odt = () =>
  zipOf([
    { name: 'mimetype', text: 'application/vnd.oasis.opendocument.text' },
    {
      name: 'content.xml',
      deflate: true,
      text: '<office:document-content><office:body><office:text><text:h>Plan</text:h><text:p>One<text:s text:c="3"/>two<text:tab/>three</text:p><text:p>Four<text:line-break/>five</text:p></office:text></office:body></office:document-content>',
    },
  ]);

export const ods = () =>
  zipOf([
    {
      name: 'content.xml',
      text: '<office:body><office:spreadsheet><table:table table:name="Data"><table:table-row><table:table-cell><text:p>a</text:p></table:table-cell><table:table-cell><text:p>b</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell/><table:table-cell><text:p>c</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body>',
    },
  ]);

export const odp = () =>
  zipOf([
    { name: 'content.xml', text: '<office:presentation><draw:page draw:name="p1"><text:p>First</text:p></draw:page><draw:page draw:name="p2"><text:p>Second</text:p></draw:page></office:presentation>' },
  ]);

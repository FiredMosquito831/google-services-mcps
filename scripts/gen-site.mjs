#!/usr/bin/env node
/**
 * Builds the GitHub Pages site in site/ from the repository data. Idempotent.
 *
 * Reads: config/products.json, docs/SURFACES.md, docs/CAPABILITIES.md,
 *        plugins/<id>/tool-map.json, .claude-plugin/marketplace.json, docs/*.md.
 *
 * Writes:
 *   site/index.html      only the marked regions: numbers, products, login groups, JSON-LD
 *   site/sitemap.xml
 *   site/assets/og.png   1200x630 PNG, rendered in pure JavaScript (zlib + a bitmap font)
 *
 * The sources are cross-checked against each other. When they disagree, or the page is
 * missing a region, the script prints every problem, exits 1 and writes nothing.
 *
 * Usage: node scripts/gen-site.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const SITE_URL = 'https://firedmosquito831.github.io/google-services-mcps/';
const REPO_URL = 'https://github.com/FiredMosquito831/google-services-mcps';
const BLOB = `${REPO_URL}/blob/main/`;
const KINDS = ['read', 'write', 'destructive', 'dynamic'];
const GUIDES = ['INSTALL', 'SETUP', 'CHOOSING', 'USING', 'SECURITY', 'LIMITS-AND-COSTS', 'GUIDE', 'SURFACES', 'CAPABILITIES'];
const HERO_NAMED = ['gmail', 'gdrive', 'gcalendar', 'gcloud', 'gsc', 'gads']; // named in the hero sub-headline
const EXAMPLE_PRODUCT = 'gmail'; // used by the install commands written in index.html
const GROUP_LABELS = {
  cloud: 'Cloud and AI',
  searchconsole: 'Search Console',
  apikey: 'Public APIs (API key)',
  'workspace-user': 'Workspace users',
  'workspace-admin': 'Workspace admin',
  business: 'Business and advertising',
  developer: 'Developer platforms',
};

const errors = [];
const fail = (message) => { errors.push(message); };
const abs = (rel) => path.join(ROOT, rel);
const readText = (rel) => fs.readFileSync(abs(rel), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));
const exists = (rel) => fs.existsSync(abs(rel));

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const decodeEntities = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = (html) => decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const inlineCode = (escaped) => escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

/** The lines under "## heading" in a Markdown file, up to the next level-2 heading. */
function markdownSection(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) { fail(`markdown heading "## ${heading}" not found`); return []; }
  const body = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) body.push(lines[i]);
  return body;
}

// ---------------------------------------------------------------- sources

const config = readJson('config/products.json');
const ids = Object.keys(config.products);
const marketplace = readJson('.claude-plugin/marketplace.json');
const marketSources = new Map(marketplace.plugins.map((p) => [p.name, p.source]));

const surfaces = readText('docs/SURFACES.md');
const surfaceHeader = surfaces.match(/(\d+) products, (\d+) catalog entries, (\d+) catalogued methods, (\d+) MCP servers/);
if (!surfaceHeader) fail('docs/SURFACES.md: summary line not found');
const surfaceRows = new Map();
for (const line of markdownSection(surfaces, 'Products')) {
  const m = line.match(/^\| `([a-z0-9]+)` \| ([^|]+?) \| ([a-z-]+) \| (\d+) \| (\d+) \((\d+)\) \| `claude plugin install ([a-z0-9]+)@([a-z0-9-]+)` \|$/);
  if (m) surfaceRows.set(m[1], { title: m[2].trim(), group: m[3], tools: Number(m[4]), gateway: Number(m[5]), install: `${m[7]}@${m[8]}` });
}
const groupSetup = new Map();
for (const line of markdownSection(surfaces, 'Login and setup per group')) {
  const m = line.match(/^\| ([a-z-]+) \| (.+) \|$/);
  if (m) groupSetup.set(m[1], m[2].trim());
}

const capabilities = readText('docs/CAPABILITIES.md');
const capHeader = {
  products: capabilities.match(/(\d+) products, each/),
  tools: capabilities.match(/(\d+) tools built/),
  perMethodApis: capabilities.match(/(\d+) APIs with per-method tools/),
  gatewayApis: capabilities.match(/(\d+) APIs through the gateway/),
};
for (const [name, m] of Object.entries(capHeader)) {
  if (!m) { fail(`docs/CAPABILITIES.md: summary value "${name}" not found`); capHeader[name] = NaN; } else capHeader[name] = Number(m[1]);
}
const capRows = new Map();
for (const line of capabilities.split('\n')) {
  const m = line.match(/^\| `([a-z0-9]+)` \| .*? \| `[^`]*` \| .*? \| (\d+) \((\d+) \/ (\d+) \/ (\d+) \/ (\d+)\) \| (\d+) \/ (\d+) \|/);
  if (m) {
    capRows.set(m[1], {
      tools: Number(m[2]),
      kinds: { read: Number(m[3]), write: Number(m[4]), destructive: Number(m[5]), dynamic: Number(m[6]) },
      perMethodApis: Number(m[7]),
      gatewayApis: Number(m[8]),
    });
  }
}

// ---------------------------------------------------------------- products

const products = ids.map((id) => {
  const entry = config.products[id];
  const kinds = Object.fromEntries(KINDS.map((k) => [k, 0]));
  let tools = 0;
  const toolMapPath = `plugins/${id}/tool-map.json`;
  if (!exists(toolMapPath)) {
    fail(`${toolMapPath} is missing: run npm run build first`);
  } else {
    const toolMap = readJson(toolMapPath);
    tools = toolMap.length;
    for (const tool of toolMap) {
      if (!(tool.kind in kinds)) fail(`${toolMapPath}: unknown kind "${tool.kind}" on ${tool.name}`);
      else kinds[tool.kind] += 1;
    }
  }
  const generated = (entry.generated || []).length;
  const gateway = (entry.gateway || []).length;

  if (!entry.title || !entry.description || !entry.group) fail(`config/products.json: ${id} needs title, description and group`);

  const row = surfaceRows.get(id);
  if (!row) {
    fail(`docs/SURFACES.md has no product row for ${id}`);
  } else {
    if (row.title !== entry.title) fail(`${id}: title is "${entry.title}" in products.json but "${row.title}" in SURFACES.md`);
    if (row.group !== entry.group) fail(`${id}: group is "${entry.group}" in products.json but "${row.group}" in SURFACES.md`);
    if (row.tools !== tools) fail(`${id}: SURFACES.md says ${row.tools} tools, tool-map.json has ${tools}`);
    if (row.gateway !== gateway) fail(`${id}: SURFACES.md says ${row.gateway} gateway APIs, products.json has ${gateway}`);
  }

  const cap = capRows.get(id);
  if (!cap) {
    fail(`docs/CAPABILITIES.md has no product row for ${id}`);
  } else {
    if (cap.tools !== tools) fail(`${id}: CAPABILITIES.md says ${cap.tools} tools, tool-map.json has ${tools}`);
    for (const k of KINDS) {
      if (cap.kinds[k] !== kinds[k]) fail(`${id}: CAPABILITIES.md says ${cap.kinds[k]} ${k} tools, tool-map.json has ${kinds[k]}`);
    }
    if (cap.perMethodApis !== generated) fail(`${id}: CAPABILITIES.md says ${cap.perMethodApis} per-method APIs, products.json has ${generated}`);
    if (cap.gatewayApis !== gateway) fail(`${id}: CAPABILITIES.md says ${cap.gatewayApis} gateway APIs, products.json has ${gateway}`);
  }

  if (marketSources.get(id) !== `./plugins/${id}`) fail(`.claude-plugin/marketplace.json has no plugin ${id} at ./plugins/${id}`);

  return {
    id,
    title: entry.title,
    description: entry.description,
    group: entry.group,
    tools,
    kinds,
    generated,
    gateway,
    install: `claude plugin install ${id}@${marketplace.name} --scope user`,
    detailPage: exists(`docs/capabilities/${id}.md`),
  };
});

for (const id of [...surfaceRows.keys(), ...capRows.keys(), ...marketSources.keys()]) {
  if (!config.products[id]) fail(`${id} appears in the docs or the marketplace but not in config/products.json`);
}
if (surfaceRows.size !== ids.length) fail(`docs/SURFACES.md lists ${surfaceRows.size} products, config/products.json has ${ids.length}`);
if (capRows.size !== ids.length) fail(`docs/CAPABILITIES.md lists ${capRows.size} products, config/products.json has ${ids.length}`);
if (surfaceHeader && Number(surfaceHeader[1]) !== ids.length) fail(`docs/SURFACES.md summary says ${surfaceHeader[1]} products`);
if (surfaceHeader && Number(surfaceHeader[4]) !== ids.length) fail(`docs/SURFACES.md summary says ${surfaceHeader[4]} MCP servers`);

const totalTools = sum(products, (p) => p.tools);
const totalGateway = sum(products, (p) => p.gateway);
const totalGenerated = sum(products, (p) => p.generated);
const kindTotals = Object.fromEntries(KINDS.map((k) => [k, sum(products, (p) => p.kinds[k])]));
if (capHeader.products !== ids.length) fail(`docs/CAPABILITIES.md summary says ${capHeader.products} products`);
if (capHeader.tools !== totalTools) fail(`docs/CAPABILITIES.md summary says ${capHeader.tools} tools built, the plugins have ${totalTools}`);
if (capHeader.gatewayApis !== totalGateway) fail(`docs/CAPABILITIES.md summary says ${capHeader.gatewayApis} gateway APIs, products.json has ${totalGateway}`);
if (capHeader.perMethodApis !== totalGenerated) fail(`docs/CAPABILITIES.md summary says ${capHeader.perMethodApis} per-method APIs, products.json has ${totalGenerated}`);

const groups = [...new Set(products.map((p) => p.group))];
for (const g of groups) {
  if (!GROUP_LABELS[g]) fail(`gen-site.mjs has no label for login group "${g}"`);
  if (!groupSetup.has(g)) fail(`docs/SURFACES.md has no login setup for group "${g}"`);
}
for (const id of [EXAMPLE_PRODUCT, ...HERO_NAMED]) {
  if (!config.products[id]) fail(`${id} is named on the page but is not in config/products.json`);
}

const methodsCatalogued = surfaceHeader ? Number(surfaceHeader[3]) : NaN;
const numbers = {
  products: String(ids.length),
  tools: fmt(totalTools),
  toolsFloor: `${fmt(Math.floor(totalTools / 100) * 100)}+`,
  gateway: fmt(totalGateway),
  methods: fmt(methodsCatalogued),
  more: String(ids.length - HERO_NAMED.length),
  groups: String(groups.length),
};

// ---------------------------------------------------------------- HTML fragments

function productCard(p) {
  const kinds = KINDS.map((k) => `<li><strong>${fmt(p.kinds[k])}</strong> ${k}</li>`).join('');
  const gateway = p.gateway
    ? `<span class="pill">${fmt(p.gateway)} gateway ${p.gateway === 1 ? 'API' : 'APIs'}</span>`
    : '';
  const detail = p.detailPage
    ? `<p class="card-links"><a href="${BLOB}docs/capabilities/${p.id}.md">Tools and methods</a></p>`
    : '';
  return [
    `        <article class="card product" id="product-${esc(p.id)}">`,
    `          <h4>${esc(p.title)}</h4>`,
    `          <p class="meta"><code>${esc(p.id)}</code><span class="pill">${fmt(p.tools)} tools</span>${gateway}</p>`,
    `          <p>${esc(p.description)}</p>`,
    `          <ul class="kinds" role="list">${kinds}</ul>`,
    `          <div class="codeblock"><pre><code>${esc(p.install)}</code></pre></div>`,
    detail ? `          ${detail}` : null,
    '        </article>',
  ].filter((line) => line !== null).join('\n');
}

function productsHtml() {
  return groups.map((g) => {
    const members = products.filter((p) => p.group === g);
    return [
      '    <div class="product-group">',
      `      <h3 id="group-${esc(g)}">${esc(GROUP_LABELS[g])} <span class="count">(${members.length})</span></h3>`,
      '      <div class="grid">',
      members.map(productCard).join('\n'),
      '      </div>',
      '    </div>',
    ].join('\n');
  }).join('\n');
}

function groupsHtml() {
  const items = groups.map((g) => {
    const members = products.filter((p) => p.group === g).map((p) => `<code>${esc(p.id)}</code>`).join(', ');
    const setup = inlineCode(esc(groupSetup.get(g) || ''));
    return `  <li><strong>${esc(GROUP_LABELS[g])}</strong> (<code>${esc(g)}</code>): ${members}. ${setup}.</li>`;
  });
  return `<ul class="groups" role="list">\n${items.join('\n')}\n</ul>`;
}

/** Replaces the body between <!-- name:start --> and <!-- name:end -->. Exactly one region must exist. */
function replaceRegion(html, name, body) {
  const re = new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`, 'g');
  const count = (html.match(re) || []).length;
  if (count !== 1) { fail(`index.html needs exactly one "${name}" region, found ${count}`); return html; }
  return html.replace(re, () => `<!-- ${name}:start -->\n${body}\n<!-- ${name}:end -->`);
}

function regionBody(html, name) {
  const m = html.match(new RegExp(`<!-- ${name}:start -->([\\s\\S]*?)<!-- ${name}:end -->`));
  return m ? m[1] : null;
}

function metaContent(html, name) {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? decodeEntities(m[1]) : null;
}

function faqItems(html) {
  const region = regionBody(html, 'faq');
  if (region === null) { fail('index.html: the "faq" region is missing'); return []; }
  const items = [...region.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/details>/g)]
    .map((m) => ({ question: plain(m[1]), answer: plain(m[2]) }));
  if (items.length !== 6) fail(`index.html: the FAQ must have 6 questions, found ${items.length}`);
  return items;
}

function jsonLdHtml(description, faq) {
  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'google-services-mcps',
    description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Windows, macOS, Linux',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    url: SITE_URL,
    codeRepository: REPO_URL,
    programmingLanguage: 'TypeScript',
  };
  const questions = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
  return [software, questions]
    .map((obj) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')}\n</script>`)
    .join('\n');
}

function sitemapXml() {
  // Only URLs on the site host are listed: search engines ignore sitemap entries on other hosts.
const urls = [SITE_URL];
  for (const g of GUIDES) {
    if (!exists(`docs/${g}.md`)) fail(`docs/${g}.md is listed in the sitemap but does not exist`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- Open Graph image (pure JavaScript PNG)

const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
};
for (const [ch, rows] of Object.entries(FONT)) {
  if (rows.length !== 7 || rows.some((r) => r.length !== 5)) fail(`font glyph "${ch}" is not 5x7`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}
function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderOgPng(stats) {
  const W = 1200;
  const H = 630;
  const rgb = Buffer.alloc(W * H * 3);
  const put = (x, y, c) => { const i = (y * W + x) * 3; rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; };
  const fill = (x, y, w, h, c) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c);
  };
  const text = (x, y, str, scale, c) => {
    let cx = x;
    for (const ch of str) {
      const glyph = FONT[ch];
      if (!glyph) { fail(`og.png: no bitmap glyph for "${ch}"`); continue; }
      glyph.forEach((row, ry) => {
        for (let col = 0; col < 5; col++) if (row[col] === '#') fill(cx + col * scale, y + ry * scale, scale, scale, c);
      });
      cx += 6 * scale;
    }
  };

  const top = [11, 16, 32];
  const bottom = [20, 33, 61];
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const c = top.map((v, k) => Math.round(v + (bottom[k] - v) * t));
    for (let x = 0; x < W; x++) put(x, y, c);
  }

  const palette = [
    [45, 212, 191], [96, 165, 250], [167, 139, 250], [251, 191, 36],
    [251, 113, 133], [163, 230, 53], [251, 146, 60],
  ];
  const title = [241, 245, 249];
  const muted = [148, 163, 184];
  const accent = [122, 162, 255];
  const statColour = [125, 211, 252];

  fill(80, 84, 120, 6, accent);
  text(80, 110, 'GOOGLE SERVICES MCPS', 8, title);
  text(80, 232, 'MCP SERVERS FOR CLAUDE CODE, CODEX, OPENCODE, ANTIGRAVITY', 3, muted);
  text(80, 300, stats, 4, statColour);

  const tile = 76;
  const gap = 12;
  const cols = 12;
  const x0 = Math.round((W - (cols * tile + (cols - 1) * gap)) / 2);
  const y0 = 400;
  products.forEach((p, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    fill(x0 + col * (tile + gap), y0 + row * (tile + gap), tile, tile, palette[groups.indexOf(p.group) % palette.length]);
  });

  text(80, 586, 'GITHUB.COM/FIREDMOSQUITO831/GOOGLE-SERVICES-MCPS', 3, muted);
  return encodePng(W, H, rgb);
}

// ---------------------------------------------------------------- assemble and check

const indexPath = path.join(SITE, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = replaceRegion(html, 'products', productsHtml());
html = replaceRegion(html, 'groups', groupsHtml());
html = html.replace(/<!-- n:([a-zA-Z]+) -->[\s\S]*?<!-- \/n:\1 -->/g, (match, name) => {
  if (!(name in numbers)) { fail(`index.html uses the unknown number "${name}"`); return match; }
  return `<!-- n:${name} -->${numbers[name]}<!-- /n:${name} -->`;
});

const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const description = metaContent(html, 'description') || '';
const visibleTitle = title.split(' | ')[0];
if (visibleTitle.length >= 70) fail(`title visible part is ${visibleTitle.length} characters; keep it under 70`);
if (description.length < 150 || description.length > 160) fail(`meta description is ${description.length} characters; keep it at 150 to 160`);
for (const prop of ['og:title', 'twitter:title']) {
  const m = html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`));
  if (!m || decodeEntities(m[1]) !== title) fail(`${prop} must equal the <title>`);
}
for (const prop of ['og:description', 'twitter:description']) {
  const m = html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`));
  if (!m || decodeEntities(m[1]) !== description) fail(`${prop} must equal the meta description`);
}
if (!html.includes(`href="${BLOB}docs/SECURITY.md"`) && !html.includes(`${REPO_URL}/blob/main/docs/SECURITY.md`)) {
  fail('index.html should link the security model');
}

const faq = faqItems(html);
html = replaceRegion(html, 'jsonld', jsonLdHtml(description, faq));

if (errors.length > 0) {
  for (const message of errors) console.error(`gen-site: ${message}`);
  console.error(`gen-site: ${errors.length} problem(s); nothing was written.`);
  process.exit(1);
}

const stats = `${ids.length} PLUGINS   ${fmt(totalTools)} TOOLS   ${fmt(totalGateway)} GATEWAY APIS`;
const ogPng = renderOgPng(stats);
const sitemap = sitemapXml();
if (errors.length > 0) {
  for (const message of errors) console.error(`gen-site: ${message}`);
  console.error(`gen-site: ${errors.length} problem(s); nothing was written.`);
  process.exit(1);
}

function writeIfChanged(file, content) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (previous && previous.equals(next)) return 'unchanged';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return previous ? 'updated' : 'created';
}

const results = [
  ['site/index.html', writeIfChanged(indexPath, html)],
  ['site/sitemap.xml', writeIfChanged(path.join(SITE, 'sitemap.xml'), sitemap)],
  ['site/assets/og.png', writeIfChanged(path.join(SITE, 'assets', 'og.png'), ogPng)],
];

console.log(`gen-site: ${ids.length} products, ${fmt(totalTools)} tools `
  + `(${KINDS.map((k) => `${k} ${fmt(kindTotals[k])}`).join(', ')}), `
  + `${fmt(totalGateway)} gateway APIs, ${groups.length} login groups, ${faq.length} FAQ items`);
for (const [file, status] of results) console.log(`gen-site: ${file} ${status}`);

#!/usr/bin/env python3
"""Build the google-services-mcps documentation site into docs/.

Reads, read-only:
  site-revamp/content/site.json          site facts and legal texts
  site-revamp/content/pages/*.json       one file per static page
  site-revamp/content/groups.json        the login groups, in the product's words
  site-revamp/templates/**               base.html, page.html, 404.html
  site-revamp/static/**                  style.css, site.js, favicon.svg, og.png, diagrams/
  site-revamp/design-tokens.json         the token source
  plugins/<id>/                          the real product manifests
  config/products.json                   product group and title
  .claude-plugin/marketplace.json        category and tags
  src/core/runtime-tools.ts              the rule for which tool-map entries a server registers
  src/core/service-account-scopes.ts     the service-account key's fixed scopes

Writes only its own paths under docs/. The product's Markdown docs in docs/ are never
touched: the builder owns HTML, assets, sitemap.xml, robots.txt, og.png, favicon.svg and
CNAME, and the check fails if any other HTML or asset under docs/ is not in the build.

Python 3.12 standard library plus Jinja2. No wall clock, no git history, no randomness.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "site-revamp"
OUT = ROOT / "docs"
PLUGINS = ROOT / "plugins"

# Paths the builder owns under docs/. Everything else in docs/ belongs to the product.
OWNED_SUFFIXES = {".html", ".css", ".js", ".svg", ".png", ".xml", ".txt"}
OWNED_NAMES = {"CNAME"}

RUNTIME_TOOL_NAMES = [
    "health",
    "auth_status",
    "auth_setup_client",
    "auth_login",
    "auth_setup_admin",
    "auth_setup_service_account",
    "accounts_list",
    "account_set_default",
    "account_remove",
]
ACCOUNT_SIGN_IN_GROUPS = {"workspace-user", "searchconsole", "business", "developer", "cloud"}

SECRET_PATTERNS = [
    ("JWT", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("Stripe-style key", re.compile(r"sk_(live|test)_[A-Za-z0-9]{8,}")),
    ("service role", re.compile(r"service_role\s*[:=]\s*[A-Za-z0-9._-]{20,}")),
    ("connection string", re.compile(r"postgres(ql)?://[^\s\"'<]+")),
    ("connection string", re.compile(r"mysql://[^\s\"'<]+")),
    ("secret assignment", re.compile(r"(?i)(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*[^\s<]{6,}")),
    ("email address", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("private address", re.compile(r"\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b")),
    ("supabase host", re.compile(r"\b[a-z]{20}\.supabase\.co\b")),
    ("owner path", re.compile(r"C:\\Users\\|/home/|/Users/")),
]
PLACEHOLDER_PATTERNS = [
    re.compile(r"\bTODO\b", re.I),
    re.compile(r"\bTBD\b", re.I),
    re.compile(r"\blorem\b", re.I),
    re.compile(r"YOUR_"),
    re.compile(r"placeholder", re.I),
    re.compile(r"\bXXX\b"),
    re.compile(r"example\.com", re.I),
    re.compile(r"coming soon", re.I),
    re.compile(r"\[insert", re.I),
    re.compile(r"FIXME", re.I),
]
WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’._-]*")


class BuildError(Exception):
    pass


# --------------------------------------------------------------------------- data


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_runtime_tools() -> list[str]:
    source = read_text(ROOT / "src" / "core" / "runtime-tools.ts")
    match = re.search(r"RUNTIME_TOOL_NAMES: readonly string\[\] = \[(.*?)\];", source, re.S)
    if not match:
        raise BuildError("runtime-tools.ts: RUNTIME_TOOL_NAMES not found")
    return re.findall(r"'([a-z_]+)'", match.group(1))


def parse_key_scopes() -> dict[str, list[str]]:
    source = read_text(ROOT / "src" / "core" / "service-account-scopes.ts")
    match = re.search(
        r"SERVICE_ACCOUNT_SCOPES_BY_SERVER: Readonly<Record<string, readonly string\[\]>> = \{(.*?)\n\};",
        source,
        re.S,
    )
    if not match:
        raise BuildError("service-account-scopes.ts: SERVICE_ACCOUNT_SCOPES_BY_SERVER not found")
    result: dict[str, list[str]] = {}
    for name, body in re.findall(r"(\w+): \[(.*?)\]", match.group(1), re.S):
        result[name] = re.findall(r"'(https://[^']+)'", body)
    return result


def runtime_tools_for(group: str) -> list[str]:
    names = ["health"]
    if group in ACCOUNT_SIGN_IN_GROUPS:
        names += [
            "auth_setup_client",
            "auth_login",
            "auth_status",
            "accounts_list",
            "account_set_default",
            "account_remove",
        ]
    if group == "service-account":
        names += ["auth_setup_service_account", "auth_status"]
    if group == "workspace-admin":
        names += ["auth_setup_admin"]
    return sorted(set(names))


def registers_entry(name: str, scopes, group: str, key_scopes) -> bool:
    if name in RUNTIME_TOOL_NAMES:
        return name in runtime_tools_for(group)
    if key_scopes is None or scopes is None or len(scopes) == 0:
        return True
    return any(scope in key_scopes for scope in scopes)


def load_products() -> list[dict]:
    products_config = load_json(ROOT / "config" / "products.json")["products"]
    marketplace = load_json(ROOT / ".claude-plugin" / "marketplace.json")
    market_by_name = {item["name"]: item for item in marketplace["plugins"]}
    key_scopes = parse_key_scopes()
    products = []
    for folder in sorted(p for p in PLUGINS.iterdir() if p.is_dir()):
        pid = folder.name
        manifest = load_json(folder / ".claude-plugin" / "plugin.json")
        servers = load_json(folder / "servers.json")
        tool_map = load_json(folder / "tool-map.json")
        scopes = load_json(folder / "scopes.json")
        server = servers["servers"][0]
        group = server.get("group") or products_config[pid]["group"]
        prefix = "mcp__plugin_%s_%s__" % (pid, pid)
        registered = []
        for tool in tool_map:
            name = tool["name"]
            short = name[len(prefix):] if name.startswith(prefix) else name
            if registers_entry(short, tool.get("scopes"), group, key_scopes.get(pid)):
                registered.append(
                    {
                        "name": short,
                        "kind": tool.get("kind", "read"),
                        "title": tool.get("title", ""),
                    }
                )
        kinds = {"read": 0, "write": 0, "destructive": 0, "dynamic": 0}
        for tool in registered:
            kinds[tool["kind"]] = kinds.get(tool["kind"], 0) + 1
        apis = sorted({(a["api"], a["version"]) for a in server.get("apis", [])})
        gateway = sorted({(a["api"], a["version"]) for a in server.get("gatewayApis", [])})
        scope_rows = []
        for api in sorted(scopes):
            for scope in scopes[api]:
                scope_rows.append({"api": api, "scope": scope})
        overrides = sorted(
            {
                scope
                for values in (server.get("scopeOverrides") or {}).values()
                for scope in values
            }
        )
        server_scopes = list(server.get("scopes") or []) or overrides
        toolsets = server.get("toolsets") or {}
        google_list = toolsets.get("google") if isinstance(toolsets, dict) else None
        market = market_by_name.get(pid, {})
        products.append(
            {
                "id": pid,
                "display_name": manifest.get("displayName") or products_config[pid]["title"],
                "title": products_config[pid]["title"],
                "description": manifest.get("description", ""),
                "version": manifest.get("version", ""),
                "group": group,
                "server_kind": server.get("kind", ""),
                "apis": apis,
                "gateway": gateway,
                "tools": sorted(registered, key=lambda t: t["name"]),
                "tool_count": len(registered),
                "kinds": kinds,
                "scopes": scope_rows,
                "scope_count": len(scope_rows),
                "scope_apis": sorted(scopes),
                "server_scopes": server_scopes,
                "google_toolset_count": len(google_list) if isinstance(google_list, list) else None,
                "category": market.get("category", ""),
                "tags": market.get("tags", []),
                "user_config": sorted((manifest.get("userConfig") or {}).keys()),
            }
        )
    return products


def load_groups() -> dict:
    return load_json(SRC / "content" / "groups.json")


def load_pages() -> list[dict]:
    pages = []
    for path in sorted((SRC / "content" / "pages").glob("*.json")):
        pages.append(load_json(path))
    return pages


# --------------------------------------------------------------------------- inline


def inline(text: str) -> str:
    """Escape, then allow `code`, **bold** and [text](url)."""
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        lambda m: '<a href="%s">%s</a>' % (html.escape(m.group(2), quote=True), m.group(1)),
        out,
    )
    return out


def slugify(text: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return value or "section"


# --------------------------------------------------------------------------- blocks


def render_blocks(blocks: list[dict], ctx: dict, env: Environment) -> str:
    parts = []
    used_ids: dict[str, int] = {}
    for block in blocks:
        kind = block["t"]
        if kind == "h2":
            base = slugify(block["text"])
            used_ids[base] = used_ids.get(base, 0) + 1
            anchor = base if used_ids[base] == 1 else "%s-%d" % (base, used_ids[base])
            parts.append('<h2 id="%s">%s</h2>' % (anchor, inline(block["text"])))
        elif kind == "h3":
            parts.append("<h3>%s</h3>" % inline(block["text"]))
        elif kind == "p":
            parts.append("<p>%s</p>" % inline(block["text"]))
        elif kind == "ul":
            items = "".join("<li>%s</li>" % inline(item) for item in block["items"])
            parts.append("<ul>%s</ul>" % items)
        elif kind == "ol":
            items = "".join("<li>%s</li>" % inline(item) for item in block["items"])
            parts.append("<ol>%s</ol>" % items)
        elif kind == "code":
            label = block.get("label")
            label_html = '<p class="code-label">%s</p>' % inline(label) if label else ""
            parts.append(
                '<div class="codeblock">%s<pre><code>%s</code></pre></div>'
                % (label_html, html.escape(block["text"], quote=False))
            )
        elif kind == "table":
            caption = '<caption>%s</caption>' % inline(block["caption"]) if block.get("caption") else ""
            head = "".join("<th scope=\"col\">%s</th>" % inline(h) for h in block["head"])
            rows = []
            for row in block["rows"]:
                cells = "".join("<td>%s</td>" % inline(cell) for cell in row)
                rows.append("<tr>%s</tr>" % cells)
            parts.append(
                '<div class="table-wrap"><table>%s<thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>'
                % (caption, head, "".join(rows))
            )
        elif kind == "note":
            parts.append('<aside class="note"><p>%s</p></aside>' % inline(block["text"]))
        elif kind == "figure":
            svg = ctx["diagrams"][block["diagram"]]
            parts.append(
                '<figure class="diagram"><div class="diagram-frame">%s</div>'
                "<figcaption>%s</figcaption></figure>"
                % (svg, inline(block["caption"]))
            )
        elif kind == "cards":
            cards = []
            for item in block["items"]:
                meta = '<p class="card-meta">%s</p>' % inline(item["meta"]) if item.get("meta") else ""
                cards.append(
                    '<li class="card"><h3><a href="%s">%s</a></h3><p>%s</p>%s</li>'
                    % (html.escape(item["href"], quote=True), inline(item["title"]), inline(item["text"]), meta)
                )
            parts.append('<ul class="cards">%s</ul>' % "".join(cards))
        elif kind == "stats":
            stats = []
            for item in ctx["stats"]:
                stats.append(
                    '<li class="stat"><span class="stat-value">%s</span><span class="stat-label">%s</span></li>'
                    % (item["value"], inline(item["label"]))
                )
            parts.append('<ul class="stats">%s</ul>' % "".join(stats))
        elif kind == "products":
            cards = []
            for product in ctx["products"]:
                cards.append(
                    '<li class="card product-card"><h3><a href="/products/%s/">%s</a></h3>'
                    '<p class="product-id"><code>%s</code></p><p>%s</p>'
                    '<p class="card-meta">%s tools &middot; %s login</p></li>'
                    % (
                        product["id"],
                        inline(product["display_name"]),
                        product["id"],
                        inline(product["description"]),
                        product["tool_count"],
                        inline(product["group"]),
                    )
                )
            parts.append('<ul class="cards product-grid">%s</ul>' % "".join(cards))
        elif kind == "faq":
            items = []
            for item in block["items"]:
                anchor = slugify(item["q"])
                items.append(
                    '<div class="faq-item"><h3 id="%s">%s</h3><p>%s</p></div>'
                    % (anchor, inline(item["q"]), inline(item["a"]))
                )
            parts.append('<div class="faq">%s</div>' % "".join(items))
        elif kind == "keyvals":
            rows = "".join(
                "<dt>%s</dt><dd>%s</dd>" % (inline(key), inline(value)) for key, value in block["rows"]
            )
            parts.append('<dl class="keyvals">%s</dl>' % rows)
        else:
            raise BuildError("unknown block type: %s" % kind)
    return "\n".join(parts)


# --------------------------------------------------------------------------- product page


def product_description(product: dict) -> str:
    """A meta description in the 120-160 character window, unique per product."""
    pid = product["id"]
    count = product["tool_count"]
    group = product["group"]
    base = product["description"].strip()
    tail = " The %s plugin registers %d tools in the %s login group." % (pid, count, group)
    candidate = base + tail
    if 120 <= len(candidate) <= 160:
        return candidate
    short = " %s: %d tools, %s login." % (pid, count, group)
    room = 160 - len(short)
    cut = base[:room].rsplit(" ", 1)[0].rstrip(",;:.")
    candidate = cut + short
    if 120 <= len(candidate) <= 160:
        return candidate
    raise BuildError("%s: cannot compose a 120-160 character description (%d)" % (pid, len(candidate)))


def product_blocks(product: dict, groups: dict) -> list[dict]:
    group = groups["groups"][product["group"]]
    kinds = product["kinds"]
    blocks: list[dict] = [
        {"t": "p", "text": product["description"]},
        {"t": "h2", "text": "Install"},
        {
            "t": "p",
            "text": "`%s` is one plugin in the `google-services-mcps` marketplace, and it runs one MCP server with the same name. Install it for Claude Code with the command below. For Codex, OpenCode or Antigravity, change `--agent`; the product id stays the same." % product["id"],
        },
        {
            "t": "code",
            "label": "Install for Claude Code",
            "text": "npx google-services-mcps install --agent claude --plugin %s" % product["id"],
        },
        {"t": "h2", "text": "What it manages"},
        {
            "t": "p",
            "text": "The server carries %d generated API bindings and %d gateway APIs. Gateway APIs are reached through `api_search`, `api_describe` and `api_call`, which every product with gateway APIs lists."
            % (len(product["apis"]), len(product["gateway"])),
        },
        {
            "t": "table",
            "caption": "Generated API bindings",
            "head": ["API", "Version"],
            "rows": [[api, version] for api, version in product["apis"]],
        },
    ]
    if product["gateway"]:
        blocks.append(
            {
                "t": "table",
                "caption": "Gateway APIs",
                "head": ["API", "Version"],
                "rows": [[api, version] for api, version in product["gateway"]],
            }
        )
    blocks += [
        {"t": "h2", "text": "Tools"},
        {
            "t": "p",
            "text": "The plugin's server registers **%d tools**: %d reads, %d writes, %d destructive actions and %d dynamic tools. A read never asks. A write is listed only when **Allow write tools** is on, and asks before it runs. A destructive action asks twice. A dynamic tool decides per call."
            % (
                product["tool_count"],
                kinds.get("read", 0),
                kinds.get("write", 0),
                kinds.get("destructive", 0),
                kinds.get("dynamic", 0),
            ),
        },
        {
            "t": "p",
            "text": "Every tool name starts with `mcp__plugin_%s_%s__`, so a call traces back to this product. The table lists the tools this server registers, with the safety class from the plugin's tool map."
            % (product["id"], product["id"]),
        },
        {
            "t": "table",
            "caption": "Registered tools",
            "head": ["Tool", "Class", "What it does"],
            "rows": [[tool["name"], tool["kind"], tool["title"]] for tool in product["tools"]],
        },
    ]
    if product["google_toolset_count"] is not None:
        blocks.append(
            {
                "t": "p",
                "text": "The plugin option `toolset` can list fewer tools. `google` lists %d tools that do the same jobs as Google's official MCP server for this product; `curated` lists the hand-written and gateway tools; `all` is the default."
                % product["google_toolset_count"],
            }
        )
    blocks += [
        {"t": "h2", "text": "Sign-in"},
        {
            "t": "p",
            "text": "`%s` belongs to the `%s` login group. %s"
            % (product["id"], product["group"], group["setup"]),
        },
    ]
    if product["scope_count"]:
        blocks.append(
            {
                "t": "p",
                "text": "The plugin's scope file lists **%d OAuth scopes** for %d APIs. A login asks only for the scopes of its profile: `readonly` (the default), `readwrite`, `full`, or an exact list."
                % (product["scope_count"], len(product["scope_apis"])),
            }
        )
        blocks.append(
            {
                "t": "table",
                "caption": "OAuth scopes in the plugin's scope file",
                "head": ["API", "Scope"],
                "rows": [[row["api"], row["scope"]] for row in product["scopes"]],
            }
        )
    elif product["server_scopes"]:
        blocks.append(
            {
                "t": "p",
                "text": "The plugin's scope file (`scopes.json`) lists no OAuth scopes for this product. Its server file (`servers.json`) declares the scopes its APIs ask for, listed below, because the APIs' Discovery documents list none; the login asks only for those its profile needs.",
            }
        )
        blocks.append(
            {
                "t": "table",
                "caption": "OAuth scopes in the server's scope list",
                "head": ["Scope"],
                "rows": [[scope] for scope in product["server_scopes"]],
            }
        )
    else:
        blocks.append(
            {
                "t": "p",
                "text": "Neither the plugin's scope file nor its server file lists OAuth scopes for this product. Its login group decides the credential.",
            }
        )
    blocks += [
        {"t": "h2", "text": "Plugin details"},
        {
            "t": "keyvals",
            "rows": [
                ["Plugin", product["id"]],
                ["MCP server", product["id"]],
                ["Display name", product["display_name"]],
                ["Version", product["version"]],
                ["Marketplace", "google-services-mcps"],
                ["Login group", product["group"]],
                ["Marketplace category", product["category"]],
                ["Plugin options", ", ".join(product["user_config"])],
                ["Server kind", product["server_kind"]],
            ],
        },
        {"t": "h2", "text": "Related"},
        {
            "t": "ul",
            "items": [
                "[All products](/products/)",
                "[Install](/install/)",
                "[Configuration](/configuration/)",
                "[How the pieces connect](/architecture/)",
                "[Troubleshooting](/troubleshooting/)",
            ],
        },
    ]
    return blocks


# --------------------------------------------------------------------------- build


def canonical(url: str, path: str) -> str:
    return url.rstrip("/") + path


def page_jsonld(page: dict, site: dict, products: list[dict], stats: list[dict]) -> list[str]:
    blocks = [
        {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": page["title"],
            "url": page.get("canonical") or site["url"],
            "description": page["description"],
        }
    ]
    if page["breadcrumbs"]:
        items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": site["url"] + "/"}]
        for position, (name, href) in enumerate(page["breadcrumbs"], start=2):
            items.append(
                {"@type": "ListItem", "position": position, "name": name, "item": site["url"] + href}
            )
        blocks.append(
            {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}
        )
    for extra in page.get("jsonld_extra", []):
        if extra == "software_application":
            blocks.append(
                {
                    "@context": "https://schema.org",
                    "@type": "SoftwareApplication",
                    "name": site["name"],
                    "alternateName": site["name"],
                    "description": site["description"],
                    "applicationCategory": "DeveloperApplication",
                    "operatingSystem": "Windows, macOS, Linux",
                    "softwareVersion": site["version"],
                    "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
                    "license": "https://www.apache.org/licenses/LICENSE-2.0",
                    "isAccessibleForFree": True,
                    "featureList": [
                        "%d products, one plugin each" % len(products),
                        "%s registered tools" % stats[1]["value"],
                        "Four harnesses: Claude Code, Codex, OpenCode and Antigravity",
                        "Reads never ask; writes ask first; destructive actions ask twice",
                    ],
                    "author": {"@type": "Person", "name": site["author"], "url": site["author_url"]},
                }
            )
        elif extra == "faq":
            items = []
            for block in page["blocks"]:
                if block["t"] == "faq":
                    for item in block["items"]:
                        items.append(
                            {
                                "@type": "Question",
                                "name": item["q"],
                                "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
                            }
                        )
            blocks.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": items})
    return [json.dumps(block, indent=2, ensure_ascii=False) for block in blocks]


def page_context(page: dict, site: dict, products: list[dict], groups: dict, diagrams: dict, stats: list[dict]) -> dict:
    return {
        "site": site,
        "page": page,
        "products": products,
        "groups": groups,
        "diagrams": diagrams,
        "stats": stats,
    }


def build(output: Path) -> dict:
    site = load_json(SRC / "content" / "site.json")
    tokens = load_json(SRC / "design-tokens.json")
    groups = load_groups()
    products = load_products()
    pages = load_pages()

    # Gates that depend on the real folders, before anything is written.
    folders = sorted(p.name for p in PLUGINS.iterdir() if p.is_dir())
    if [p["id"] for p in products] != folders:
        raise BuildError("product list does not match plugins/*/ folders")
    if len(products) != len(folders):
        raise BuildError("generated product count %d != folder count %d" % (len(products), len(folders)))
    for product in products:
        if not product["description"].strip():
            raise BuildError("%s: no description in .claude-plugin/plugin.json" % product["id"])
        if product["tool_count"] == 0:
            raise BuildError("%s: no registered tools" % product["id"])

    stats = [
        {"value": str(len(products)), "label": "products"},
        {"value": str(sum(p["tool_count"] for p in products)), "label": "registered tools"},
        {"value": str(len({row["scope"] for p in products for row in p["scopes"]})), "label": "OAuth scopes"},
        {"value": str(len({p["group"] for p in products})), "label": "login groups"},
    ]
    versions = sorted({p["version"] for p in products})
    if len(versions) != 1:
        raise BuildError("plugins disagree on the version: %s" % ", ".join(versions))
    site["version"] = versions[0]
    site["product_count"] = len(products)
    site["tool_count"] = stats[1]["value"]

    diagrams = {}
    for path in sorted((SRC / "static" / "diagrams").glob("*.svg")):
        svg = read_text(path)
        if "<title" not in svg or "<desc" not in svg or 'role="img"' not in svg:
            raise BuildError("diagram %s: needs role=img, <title> and <desc>" % path.name)
        diagrams[path.stem] = svg

    env = Environment(
        loader=FileSystemLoader(str(SRC / "templates")),
        autoescape=False,
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["inline"] = inline

    prefix = site["url"].rstrip("/")
    rendered: dict[str, str] = {}
    page_meta: dict[str, dict] = {}

    def emit(path: str, body: str, meta: dict) -> None:
        rendered[path] = body
        page_meta[path] = meta

    # Static pages.
    for page in pages:
        blocks_html = render_blocks(page["blocks"], page_context(page, site, products, groups, diagrams, stats), env)
        meta = {
            "title": page["title"],
            "description": page["description"],
            "canonical": canonical(prefix, page["path"]),
            "path": page["path"],
            "section": page.get("section", page["path"]),
            "breadcrumbs": page.get("breadcrumbs", []),
            "jsonld_extra": page.get("jsonld_extra", []),
            "noindex": page.get("noindex", False),
            "words_min": page.get("words_min", 0),
            "h1": page["h1"],
            "eyebrow": page.get("eyebrow", ""),
            "hero": page.get("hero", False),
            "lead": page.get("lead", ""),
            "actions": page.get("actions", []),
            "blocks": page["blocks"],
            "claims": page.get("claims"),
        }
        meta["jsonld"] = page_jsonld(meta, site, products, stats)
        body = env.get_template("page.html").render(
            site=site, page=meta, content=blocks_html, tokens=tokens, nav=site["nav"],
            legal=site["legal"], stats=stats,
        )
        target = "index.html" if page["path"] == "/" else page["path"].strip("/") + "/index.html"
        emit(target, body, meta)

    # Product pages.
    for product in products:
        path = "/products/%s/" % product["id"]
        blocks = product_blocks(product, groups)
        page = {
            "title": "%s | google-services-mcps" % product["display_name"],
            "description": product_description(product),
            "path": path,
            "canonical": canonical(prefix, path),
            "section": "/products/",
            "h1": product["display_name"],
            "eyebrow": "Product",
            "breadcrumbs": [["Products", "/products/"], [product["display_name"], path]],
            "jsonld_extra": [],
            "noindex": False,
            "words_min": 300,
            "hero": False,
            "lead": "",
            "actions": [],
            "blocks": blocks,
            "claims": [
                {
                    "text": product["description"],
                    "evidence": "plugins/%s/.claude-plugin/plugin.json" % product["id"],
                    "status": "verified",
                },
                {
                    "text": "%d registered tools" % product["tool_count"],
                    "evidence": "plugins/%s/tool-map.json; src/core/runtime-tools.ts (registersEntry)" % product["id"],
                    "status": "verified",
                },
                {
                    "text": "%d OAuth scopes" % product["scope_count"],
                    "evidence": "plugins/%s/scopes.json" % product["id"],
                    "status": "verified",
                },
                {
                    "text": "server scope list: %s" % (", ".join(product["server_scopes"]) or "none"),
                    "evidence": "plugins/%s/servers.json (scopes or scopeOverrides)" % product["id"],
                    "status": "verified",
                },
                {
                    "text": "%s login group" % product["group"],
                    "evidence": "plugins/%s/servers.json" % product["id"],
                    "status": "verified",
                },
            ],
        }
        page["jsonld"] = page_jsonld(page, site, products, stats)
        blocks_html = render_blocks(blocks, page_context(page, site, products, groups, diagrams, stats), env)
        body = env.get_template("page.html").render(
            site=site, page=page, content=blocks_html, tokens=tokens, nav=site["nav"],
            legal=site["legal"], stats=stats,
        )
        emit(path.strip("/") + "/index.html", body, page)

    # 404.
    not_found = {
        "title": "Page not found | google-services-mcps",
        "description": "This page does not exist. Go back to the home page, or browse the product reference for all 23 plugins and their tools and login groups.",
        "canonical": "",
        "path": "/404.html",
        "section": "",
        "breadcrumbs": [],
        "jsonld": [],
        "jsonld_extra": [],
        "noindex": True,
        "words_min": 0,
        "h1": "Page not found",
        "eyebrow": "Error 404",
        "hero": False,
        "lead": "",
        "actions": [],
        "blocks": [],
    }
    body = env.get_template("404.html").render(
        site=site, page=not_found, tokens=tokens, legal=site["legal"], stats=stats, nav=site["nav"]
    )
    emit("404.html", body, not_found)

    # Write the tree.
    output.mkdir(parents=True, exist_ok=True)
    for rel, body in sorted(rendered.items()):
        target = output / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8", newline="\n")

    assets = output / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "style.css").write_text(render_css(tokens), encoding="utf-8", newline="\n")
    shutil.copyfile(SRC / "static" / "site.js", assets / "site.js")
    shutil.copyfile(SRC / "static" / "og.png", output / "og.png")
    shutil.copyfile(SRC / "static" / "favicon.svg", output / "favicon.svg")
    diagram_out = assets / "diagrams"
    diagram_out.mkdir(parents=True, exist_ok=True)
    for name, svg in diagrams.items():
        (diagram_out / (name + ".svg")).write_text(svg, encoding="utf-8", newline="\n")

    (output / "sitemap.xml").write_text(render_sitemap(site, pages, products), encoding="utf-8", newline="\n")
    (output / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % prefix, encoding="utf-8", newline="\n"
    )
    (output / "CNAME").write_text(site["cname"] + "\n", encoding="utf-8", newline="\n")

    return {
        "products": products,
        "pages": page_meta,
        "rendered": rendered,
        "stats": stats,
        "site": site,
        "tokens": tokens,
    }


def render_css(tokens: dict) -> str:
    dark = tokens["color_dark"]
    light = tokens["color_light"]
    lines = ["/* Generated by scripts/build_site.py. Colours come from site-revamp/design-tokens.json. */"]
    lines.append(":root {")
    lines.append("  color-scheme: light dark;")
    for key, value in light.items():
        lines.append("  --%s: %s;" % (key, value))
    lines.append("  --font-sans: %s;" % tokens["font"]["sans"])
    lines.append("  --font-mono: %s;" % tokens["font"]["mono"])
    for key, value in tokens["space"].items():
        lines.append("  --space-%s: %s;" % (key, value))
    for key, value in tokens["radius"].items():
        lines.append("  --radius-%s: %s;" % (key, value))
    lines.append("  --shadow-card: %s;" % tokens["shadow"]["card"])
    lines.append("  --motion-fast: %s;" % tokens["motion"]["fast"])
    lines.append("  --motion-base: %s;" % tokens["motion"]["base"])
    lines.append("  --motion-ease: %s;" % tokens["motion"]["ease"])
    lines.append("  --max-width: %s;" % tokens["layout"]["max_width"])
    lines.append("  --gutter: %s;" % tokens["layout"]["gutter"])
    lines.append("}")
    lines.append("@media (prefers-color-scheme: dark) {")
    lines.append('  :root:not([data-theme="light"]) {')
    for key, value in dark.items():
        lines.append("    --%s: %s;" % (key, value))
    lines.append("  }")
    lines.append("}")
    lines.append(read_text(SRC / "static" / "style.css"))
    return "\n".join(lines) + "\n"


def render_sitemap(site: dict, pages: list[dict], products: list[dict]) -> str:
    prefix = site["url"].rstrip("/")
    entries = []
    for page in pages:
        if page.get("noindex"):
            continue
        entries.append((page["path"], page.get("priority", "0.5")))
    for product in products:
        entries.append(("/products/%s/" % product["id"], "0.6"))
    entries.sort()
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, priority in entries:
        lines.append("  <url>")
        lines.append("    <loc>%s%s</loc>" % (prefix, path))
        lines.append("    <lastmod>%s</lastmod>" % site["lastmod"])
        lines.append("    <priority>%s</priority>" % priority)
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------- gates


def main_content(body: str) -> str:
    match = re.search(r"<main[^>]*>(.*?)</main>", body, re.S)
    return match.group(1) if match else body


def visible_text(body: str) -> str:
    body = main_content(body)
    body = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    body = re.sub(r"<style.*?</style>", " ", body, flags=re.S)
    body = re.sub(r"<svg.*?</svg>", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    return html.unescape(body)


def prose_text(body: str) -> str:
    body = re.sub(r'<ul class="cards[^"]*">.*?</ul>', " ", main_content(body), flags=re.S)
    body = re.sub(r"<table.*?</table>", " ", body, flags=re.S)
    return visible_text(body)


def word_count(text: str) -> int:
    return len(WORD_RE.findall(text))


def gate_metadata(rendered: dict, meta: dict) -> list[str]:
    errors = []
    titles = {}
    descriptions = {}
    for rel, body in rendered.items():
        info = meta[rel]
        h1s = re.findall(r"<h1[\s>]", body)
        if len(h1s) != 1:
            errors.append("%s: %d <h1> elements" % (rel, len(h1s)))
        title = info["title"]
        if len(title) > 60:
            errors.append("%s: title is %d characters" % (rel, len(title)))
        if title in titles:
            errors.append("%s: duplicate title (also %s)" % (rel, titles[title]))
        titles[title] = rel
        desc = info["description"]
        if not (120 <= len(desc) <= 160):
            errors.append("%s: description is %d characters" % (rel, len(desc)))
        if desc in descriptions:
            errors.append("%s: duplicate description (also %s)" % (rel, descriptions[desc]))
        descriptions[desc] = rel
        if not info["noindex"]:
            if 'rel="canonical"' not in body:
                errors.append("%s: no canonical" % rel)
            if info["canonical"] not in body:
                errors.append("%s: canonical mismatch" % rel)
        for needle in ('property="og:title"', 'property="og:description"', 'property="og:url"',
                       'property="og:image"', 'property="og:image:alt"', 'property="og:locale"',
                       'name="twitter:card"', 'name="twitter:title"', 'name="twitter:description"',
                       'name="twitter:image"', 'name="theme-color"'):
            if needle not in body:
                errors.append("%s: missing %s" % (rel, needle))
    return errors


def gate_words(rendered: dict, meta: dict) -> list[str]:
    errors = []
    for rel, body in rendered.items():
        minimum = meta[rel].get("words_min", 0)
        if not minimum:
            continue
        total = word_count(visible_text(body))
        prose = word_count(prose_text(body))
        if total < minimum:
            errors.append("%s: %d words, minimum %d" % (rel, total, minimum))
        if rel.startswith("products/") and rel != "products/index.html" and prose < 120:
            errors.append("%s: %d prose words, minimum 120" % (rel, prose))
    return errors


def gate_links(rendered: dict, output: Path) -> list[str]:
    errors = []
    ids: dict[str, set] = {}
    for rel, body in rendered.items():
        ids[rel] = set(re.findall(r'\bid="([^"]+)"', body))
    for rel, body in rendered.items():
        for attr, value in re.findall(r'\b(href|src)="([^"]+)"', body):
            if value.startswith(("http://", "https://", "mailto:", "data:")):
                continue
            path, _, fragment = value.partition("#")
            if not path:
                target = rel
            elif path.startswith("/"):
                rel_path = path.strip("/")
                if rel_path == "":
                    target = "index.html"
                elif "." in Path(rel_path).name:
                    target = rel_path
                else:
                    target = rel_path + "/index.html"
            else:
                base = Path(rel).parent
                joined = (base / path).as_posix()
                joined = re.sub(r"/\./", "/", joined)
                if joined.endswith("/"):
                    target = joined + "index.html"
                elif "." in Path(joined).name:
                    target = joined
                else:
                    target = joined + "/index.html"
            if target not in rendered and not (output / target).is_file():
                errors.append("%s: %s does not resolve (%s)" % (rel, value, target))
                continue
            if fragment and target in ids and fragment not in ids[target]:
                errors.append("%s: fragment #%s not in %s" % (rel, fragment, target))
    return errors


def gate_jsonld(rendered: dict) -> list[str]:
    errors = []
    for rel, body in rendered.items():
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', body, re.S):
            try:
                json.loads(block)
            except json.JSONDecodeError as exc:
                errors.append("%s: JSON-LD does not parse (%s)" % (rel, exc))
    return errors


def gate_alt(rendered: dict) -> list[str]:
    errors = []
    for rel, body in rendered.items():
        for tag in re.findall(r"<img\b[^>]*>", body):
            if not re.search(r'\balt="[^"]+"', tag):
                errors.append("%s: image without alt" % rel)
        for svg in re.findall(r"<svg\b[^>]*>", body):
            if 'role="img"' not in svg and 'aria-hidden="true"' not in svg:
                errors.append("%s: svg without role=img or aria-hidden" % rel)
    return errors


def gate_sitemap(output: Path, site: dict) -> list[str]:
    errors = []
    sitemap = output / "sitemap.xml"
    if not sitemap.is_file():
        return ["sitemap.xml missing"]
    text = sitemap.read_text(encoding="utf-8")
    prefix = site["url"].rstrip("/")
    for loc in re.findall(r"<loc>([^<]+)</loc>", text):
        if not loc.startswith(prefix + "/"):
            errors.append("sitemap: %s is not on %s" % (loc, prefix))
            continue
        rel = loc[len(prefix) + 1:].strip("/")
        target = "index.html" if rel == "" else rel + "/index.html"
        if not (output / target).is_file():
            errors.append("sitemap: %s has no file" % loc)
    if "<lastmod>%s</lastmod>" % site["lastmod"] not in text:
        errors.append("sitemap: lastmod is not %s" % site["lastmod"])
    return errors


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise BuildError("%s is not a PNG" % path)
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return width, height


def gate_og(output: Path) -> list[str]:
    path = output / "og.png"
    if not path.is_file():
        return ["og.png missing"]
    width, height = png_size(path)
    if (width, height) != (1200, 630):
        return ["og.png is %dx%d, not 1200x630" % (width, height)]
    return []


def gate_tokens(output: Path, tokens: dict) -> list[str]:
    errors = []
    css = (output / "assets" / "style.css").read_text(encoding="utf-8")
    allowed = set(tokens["color_dark"].values()) | set(tokens["color_light"].values())
    for match in re.finditer(r"#[0-9A-Fa-f]{3,8}\b", css):
        if match.group(0) not in allowed:
            errors.append("style.css: colour %s is not in the token file" % match.group(0))
    return sorted(set(errors))


def gate_text_files(paths: list[Path]) -> list[str]:
    errors = []
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), 1):
            for name, pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    errors.append("%s:%d: secret scan: %s" % (path, number, name))
            for pattern in PLACEHOLDER_PATTERNS:
                if pattern.search(line):
                    errors.append("%s:%d: forbidden string: %s" % (path, number, pattern.pattern))
    return errors


def gate_diagrams(rendered: dict) -> list[str]:
    errors = []
    for rel, body in rendered.items():
        for figure in re.findall(r'<figure class="diagram">.*?</figure>', body, re.S):
            if "<svg" not in figure:
                errors.append("%s: diagram figure without an svg" % rel)
                continue
            if "<title" not in figure or "<desc" not in figure:
                errors.append("%s: diagram without <title> or <desc>" % rel)
            if "<figcaption>" not in figure:
                errors.append("%s: diagram without a figcaption" % rel)
    return errors


def gate_faq(rendered: dict) -> list[str]:
    errors = []
    for rel, body in rendered.items():
        blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', body, re.S)
        for block in blocks:
            data = json.loads(block)
            if data.get("@type") != "FAQPage":
                continue
            questions = [item["name"] for item in data["mainEntity"]]
            visible = re.findall(r'<div class="faq-item"><h3 id="[^"]+">(.*?)</h3>', body)
            visible = [html.unescape(re.sub(r"<[^>]+>", "", q)) for q in visible]
            if questions != visible:
                errors.append("%s: FAQ JSON-LD does not match the visible questions" % rel)
    return errors


def gate_claims(meta: dict) -> list[str]:
    errors = []
    for rel, info in meta.items():
        claims = info.get("claims")
        if claims is None:
            if info.get("path") != "/404.html":
                errors.append("%s: no claims list" % rel)
            continue
        if not claims:
            errors.append("%s: no claims" % rel)
        for claim in claims:
            if not claim.get("text") or not claim.get("evidence"):
                errors.append("%s: claim without text or evidence" % rel)
            if claim.get("status") not in ("verified", "removed"):
                errors.append("%s: claim status %r" % (rel, claim.get("status")))
    return errors


def gate_owned_files(output: Path, rendered: dict) -> list[str]:
    """Every HTML or asset file under docs/ must come from this build."""
    errors = []
    expected = set(rendered)
    expected |= {"assets/style.css", "assets/site.js", "og.png", "favicon.svg", "sitemap.xml", "robots.txt", "CNAME"}
    for path in sorted(output.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(output).as_posix()
        if path.suffix.lower() == ".md" or rel == "ads-version.txt":
            continue
        if path.suffix.lower() not in OWNED_SUFFIXES and path.name not in OWNED_NAMES:
            continue
        if rel not in expected and not rel.startswith("assets/diagrams/"):
            errors.append("docs/%s is not in the build" % rel)
    return errors


# --------------------------------------------------------------------------- check


def compare(fresh: Path, existing: Path) -> list[str]:
    differences = []
    fresh_files = sorted(p.relative_to(fresh).as_posix() for p in fresh.rglob("*") if p.is_file())
    for rel in fresh_files:
        target = existing / rel
        if not target.is_file():
            differences.append("missing: %s" % rel)
        elif target.read_bytes() != (fresh / rel).read_bytes():
            differences.append("differs: %s" % rel)
    for path in sorted(existing.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(existing).as_posix()
        if path.suffix.lower() == ".md" or rel == "ads-version.txt":
            continue
        if rel in fresh_files:
            continue
        if path.suffix.lower() in OWNED_SUFFIXES or path.name in OWNED_NAMES:
            differences.append("extra: %s" % rel)
    return differences


def run_gates(output: Path, result: dict) -> list[str]:
    rendered = result["rendered"]
    meta = result["pages"]
    errors = []
    errors += gate_metadata(rendered, meta)
    errors += gate_words(rendered, meta)
    errors += gate_links(rendered, output)
    errors += gate_jsonld(rendered)
    errors += gate_alt(rendered)
    errors += gate_sitemap(output, result["site"])
    errors += gate_og(output)
    errors += gate_tokens(output, result["tokens"])
    errors += gate_diagrams(rendered)
    errors += gate_faq(rendered)
    errors += gate_claims(meta)
    errors += gate_owned_files(output, rendered)
    scanned = [SRC / "content" / "site.json"]
    scanned += sorted((SRC / "content" / "pages").glob("*.json"))
    scanned += [SRC / "static" / "style.css", SRC / "static" / "site.js", SRC / "static" / "favicon.svg"]
    scanned += sorted((SRC / "static" / "diagrams").glob("*.svg"))
    scanned += [output / rel for rel in sorted(rendered)]
    errors += gate_text_files(scanned)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the google-services-mcps docs site.")
    parser.add_argument("--check", action="store_true", help="build into a temp dir and compare with docs/")
    parser.add_argument("--report", action="store_true", help="print per-page word counts")
    args = parser.parse_args()

    try:
        if args.check:
            with tempfile.TemporaryDirectory() as tmp:
                result = build(Path(tmp))
                errors = run_gates(Path(tmp), result)
                if errors:
                    print("gates failed:")
                    for error in errors:
                        print("  " + error)
                    return 1
                differences = compare(Path(tmp), OUT)
                if differences:
                    print("check: docs/ differs from a fresh build:")
                    for name in differences:
                        print("  " + name)
                    return 1
                print("check: docs/ is byte-identical to a fresh build")
                print("gates: all passed")
                return 0
        result = build(OUT)
        errors = run_gates(OUT, result)
        if errors:
            print("gates failed:")
            for error in errors:
                print("  " + error)
            return 1
        print("built %d pages into docs/" % len(result["rendered"]))
        print("products: %d, registered tools: %s" % (len(result["products"]), result["stats"][1]["value"]))
        print("gates: all passed")
        if args.report:
            print()
            print("| Page | Words | Prose | Minimum |")
            print("|---|---:|---:|---:|")
            for rel in sorted(result["rendered"]):
                body = result["rendered"][rel]
                print(
                    "| %s | %d | %d | %d |"
                    % (rel, word_count(visible_text(body)), word_count(prose_text(body)), result["pages"][rel].get("words_min", 0))
                )
        return 0
    except BuildError as exc:
        print("build failed: %s" % exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

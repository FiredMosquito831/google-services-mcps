/**
 * Converts Google Discovery JSON schemas and method parameters into zod v3 types.
 *
 * Recursion is bounded two ways: a $ref already on the expansion path is not
 * expanded again (the seen-set), and at most MAX_REF_DEPTH named schemas are
 * expanded along one path. Past either limit the node becomes z.any(). A node
 * budget per conversion keeps very large request bodies under control.
 */
import { z } from 'zod';

/** A Discovery schema node, as kept in data/discovery snapshots. */
export interface SchemaNode {
  id?: string;
  type?: string;
  format?: string;
  description?: string;
  $ref?: string;
  properties?: Record<string, SchemaNode>;
  additionalProperties?: SchemaNode | boolean;
  items?: SchemaNode;
  enum?: string[];
  /** Discovery puts required:true on parameters; JSON Schema uses a list on the parent object. */
  required?: boolean | string[];
  default?: unknown;
}

/** A method parameter (query or path), as kept in data/discovery snapshots. */
export interface DiscoveryParam {
  name: string;
  location?: string;
  type?: string;
  format?: string;
  required?: boolean;
  repeated?: boolean;
  enum?: string[];
  default?: unknown;
  description?: string;
}

export const MAX_REF_DEPTH = 4;
export const MAX_NODES = 200;
export const SCHEMA_DESC_MAX = 160;
export const PARAM_DESC_MAX = 200;

export interface SchemaContext {
  /** Named schemas of one Discovery document, keyed by schema id. */
  schemas: Record<string, SchemaNode>;
  maxRefDepth?: number;
  maxNodes?: number;
}

interface WalkState {
  stack: string[];
  nodes: number;
  maxNodes: number;
  maxRefDepth: number;
}

const EMPTY_CONTEXT: SchemaContext = { schemas: {} };

export function clipText(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function newState(ctx: SchemaContext): WalkState {
  return {
    stack: [],
    nodes: 0,
    maxNodes: ctx.maxNodes ?? MAX_NODES,
    maxRefDepth: ctx.maxRefDepth ?? MAX_REF_DEPTH,
  };
}

/** Converts one Discovery schema node (typically a request body) to a zod type. */
export function schemaToZod(node: SchemaNode | undefined, ctx: SchemaContext): z.ZodTypeAny {
  return walk(node, ctx, newState(ctx));
}

/** Converts a query or path parameter to a zod type. Path parameters are required strings. */
export function paramToZod(param: DiscoveryParam): z.ZodTypeAny {
  const node: SchemaNode = { type: param.type, format: param.format, enum: param.enum };
  let out = walk(node, EMPTY_CONTEXT, newState(EMPTY_CONTEXT));
  if (param.repeated) out = z.array(out);

  let description = clipText(param.description, PARAM_DESC_MAX) ?? '';
  if (param.default !== undefined) description = `${description} Default: ${String(param.default)}.`.trim();
  if (description) out = out.describe(description);

  return param.required ? out : out.optional();
}

function walk(node: SchemaNode | undefined, ctx: SchemaContext, st: WalkState): z.ZodTypeAny {
  if (!node || typeof node !== 'object') return z.any();
  if (st.nodes >= st.maxNodes) return z.any();
  st.nodes++;

  let out: z.ZodTypeAny;
  if (node.$ref) {
    const ref = node.$ref;
    const target = ctx.schemas[ref];
    if (!target || st.stack.includes(ref) || st.stack.length >= st.maxRefDepth) {
      out = z.any();
    } else {
      st.stack.push(ref);
      try {
        out = walk(target, ctx, st);
      } finally {
        st.stack.pop();
      }
    }
  } else {
    out = typed(node, ctx, st);
  }

  const description = clipText(node.description, SCHEMA_DESC_MAX);
  return description ? out.describe(description) : out;
}

function typed(node: SchemaNode, ctx: SchemaContext, st: WalkState): z.ZodTypeAny {
  if (node.enum && node.enum.length > 0) return enumOrString(node.enum);

  switch (node.type) {
    case 'string':
      return z.string();
    case 'integer':
      return z.number().int();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(walk(node.items, ctx, st));
    case 'object':
      return objectOf(node, ctx, st);
    default:
      // any, unknown or missing type. A missing type with properties is still an object.
      if (node.properties || node.additionalProperties !== undefined) return objectOf(node, ctx, st);
      if (node.items) return z.array(walk(node.items, ctx, st));
      return z.any();
  }
}

function enumOrString(values: string[]): z.ZodTypeAny {
  const unique = [...new Set(values.filter((v) => typeof v === 'string'))];
  if (unique.length === 0) return z.string();
  return z.enum(unique as [string, ...string[]]);
}

function objectOf(node: SchemaNode, ctx: SchemaContext, st: WalkState): z.ZodTypeAny {
  const props = node.properties ?? {};
  if (Object.keys(props).length > 0) {
    const requiredNames = new Set(Array.isArray(node.required) ? node.required : []);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(props)) {
      const child = walk(prop, ctx, st);
      const required = prop.required === true || requiredNames.has(key);
      shape[key] = required ? child : child.optional();
    }
    return z.object(shape);
  }

  if (node.additionalProperties !== undefined && node.additionalProperties !== false) {
    const valueSchema = node.additionalProperties === true ? z.any() : walk(node.additionalProperties, ctx, st);
    return z.record(z.string(), valueSchema);
  }

  // An object with no declared fields is a free-form map.
  return z.record(z.string(), z.any());
}

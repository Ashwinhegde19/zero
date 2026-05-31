import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { getProviderDefinition } from './catalog';
import type {
  ModelDefinition,
  ModelDiscoveryResult,
  ProviderDefinition,
  ResolvedModelDefinition,
} from './catalog/types';

interface CacheEntry {
  recordedAt: number;
  models: ResolvedModelDefinition[];
  error?: string;
}

interface DiscoveryCache {
  entries: Record<string, CacheEntry>;
}

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

function cacheDir(): string {
  return process.env.ZERO_CONFIG_DIR || join(homedir(), '.config', 'zero');
}

function cachePath(): string {
  return join(cacheDir(), 'model-cache.json');
}

function ensureCacheDir() {
  const dir = cacheDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readCache(): DiscoveryCache {
  ensureCacheDir();

  const path = cachePath();
  if (!existsSync(path)) {
    return { entries: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return { entries: parsed.entries ?? {} };
  } catch {
    return { entries: {} };
  }
}

function writeCache(cache: DiscoveryCache) {
  ensureCacheDir();
  writeFileSync(cachePath(), JSON.stringify(cache, null, 2), 'utf-8');
}

function parseDuration(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return DEFAULT_CACHE_TTL_MS;

  const match = value.trim().match(/^(\d+)(m|h|d)$/);
  if (!match) return DEFAULT_CACHE_TTL_MS;

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function cacheKey(definition: ProviderDefinition, apiKey?: string): string {
  const baseURL = definition.baseURL.replace(/\/+$/, '').toLowerCase();
  const authPartition = definition.catalog?.discovery?.requiresAuth === false || !apiKey
    ? 'public'
    : `key:${createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
  return `${definition.id}:${baseURL}:${authPartition}`;
}

function staticModels(definition: ProviderDefinition): ResolvedModelDefinition[] {
  return (definition.catalog?.models ?? definition.models ?? []).map((model) =>
    resolveModel(model, definition)
  );
}

function resolveModel(
  model: ModelDefinition,
  definition: ProviderDefinition
): ResolvedModelDefinition {
  return {
    ...model,
    apiName: model.apiName ?? model.id,
    providerId: definition.id,
    providerName: definition.name,
    providerKind: definition.kind,
  };
}

function mergeModels(
  staticEntries: ResolvedModelDefinition[],
  discoveredEntries: ResolvedModelDefinition[]
): ResolvedModelDefinition[] {
  const merged = [...staticEntries];
  const seen = new Set(staticEntries.map((model) => model.apiName.toLowerCase()));

  for (const entry of discoveredEntries) {
    if (seen.has(entry.apiName.toLowerCase())) continue;
    seen.add(entry.apiName.toLowerCase());
    merged.push(entry);
  }

  return merged;
}

function discoveryUrl(definition: ProviderDefinition): string {
  const baseURL = definition.baseURL.replace(/\/+$/, '');
  const path = definition.catalog?.discovery?.path ?? '/models';
  return `${baseURL}${path.startsWith('/') ? path : `/${path}`}`;
}

function discoveryHeaders(definition: ProviderDefinition, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...(definition.transportConfig?.headers ?? {}),
    ...(definition.transportConfig?.openaiShim?.headers ?? {}),
  };

  if (apiKey && definition.catalog?.discovery?.requiresAuth !== false) {
    const authHeader = definition.transportConfig?.openaiShim?.defaultAuthHeader ?? {
      name: 'authorization',
      scheme: 'bearer' as const,
    };
    headers[authHeader.name] = authHeader.scheme === 'raw' ? apiKey : `Bearer ${apiKey}`;
  }

  return headers;
}

async function discoverOpenAICompatibleModels(
  definition: ProviderDefinition,
  apiKey?: string
): Promise<ResolvedModelDefinition[]> {
  const response = await fetch(discoveryUrl(definition), {
    headers: discoveryHeaders(definition, apiKey),
  });

  if (!response.ok) {
    throw new Error(`model discovery failed (${response.status})`);
  }

  const parsed: any = await response.json();
  const rows = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];

  return rows
    .map((row: any) => typeof row === 'string' ? row : row?.id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => resolveModel({ id, name: id }, definition));
}

async function discoverOllamaModels(definition: ProviderDefinition): Promise<ResolvedModelDefinition[]> {
  const baseURL = definition.baseURL.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  const response = await fetch(`${baseURL}/api/tags`);

  if (!response.ok) {
    throw new Error(`ollama discovery failed (${response.status})`);
  }

  const parsed: any = await response.json();
  const rows = Array.isArray(parsed?.models) ? parsed.models : [];

  return rows
    .map((row: any) => row?.name)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => resolveModel({ id, name: id, tier: 'local' }, definition));
}

async function runDiscovery(
  definition: ProviderDefinition,
  apiKey?: string
): Promise<ResolvedModelDefinition[]> {
  const discovery = definition.catalog?.discovery;
  if (!discovery) return [];

  if (discovery.kind === 'openai-compatible') {
    return discoverOpenAICompatibleModels(definition, apiKey);
  }

  if (discovery.kind === 'ollama') {
    return discoverOllamaModels(definition);
  }

  throw new Error(`custom discovery is not executable from JSON descriptors`);
}

export async function discoverModelsForProvider(
  providerId: string,
  options: {
    apiKey?: string;
    forceRefresh?: boolean;
    allowNetwork?: boolean;
  } = {}
): Promise<ModelDiscoveryResult | null> {
  const definition = getProviderDefinition(providerId);
  if (!definition) return null;

  const staticEntries = staticModels(definition);
  const discovery = definition.catalog?.discovery;
  if (!discovery) {
    return {
      providerId,
      models: staticEntries,
      source: 'static',
      stale: false,
    };
  }

  const ttlMs = parseDuration(definition.catalog?.discoveryCacheTtl);
  const key = cacheKey(definition, options.apiKey);
  const cache = readCache();
  const cached = cache.entries[key];
  const stale = cached ? Date.now() - cached.recordedAt > ttlMs : false;

  if (!options.forceRefresh && cached && !stale) {
    return {
      providerId,
      models: mergeModels(staticEntries, cached.models),
      source: 'cache',
      stale: false,
      error: cached.error,
    };
  }

  if (options.allowNetwork === false) {
    return {
      providerId,
      models: mergeModels(staticEntries, cached?.models ?? []),
      source: cached ? 'stale-cache' : 'static',
      stale: Boolean(cached && stale),
      error: cached?.error,
    };
  }

  try {
    const discovered = await runDiscovery(definition, options.apiKey);
    cache.entries[key] = { recordedAt: Date.now(), models: discovered };
    writeCache(cache);

    return {
      providerId,
      models: mergeModels(staticEntries, discovered),
      source: 'network',
      stale: false,
    };
  } catch (error: any) {
    const message = error?.message ?? String(error);
    if (cached) {
      cache.entries[key] = {
        ...cached,
        error: message,
      };
      writeCache(cache);
    }

    return {
      providerId,
      models: mergeModels(staticEntries, cached?.models ?? []),
      source: cached ? 'stale-cache' : 'error',
      stale: Boolean(cached),
      error: message,
    };
  }
}

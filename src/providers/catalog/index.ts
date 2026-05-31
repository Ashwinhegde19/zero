import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ModelDefinition, ProviderDefinition, ResolvedModelDefinition } from './types';

type EmbeddedFile = Blob & { name: string };

async function readJsonFiles<T>(directory: 'definitions' | 'models'): Promise<T[]> {
  const directoryPath = join(import.meta.dir, directory);

  if (existsSync(directoryPath)) {
    return readdirSync(directoryPath)
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(join(directoryPath, file), 'utf-8')) as T);
  }

  const embeddedFiles = (globalThis as any).Bun?.embeddedFiles as EmbeddedFile[] | undefined;
  if (!embeddedFiles) return [];

  const parsedFiles = await Promise.all(
    embeddedFiles
      .filter((file) => file.name.endsWith('.json'))
      .map(async (file) => JSON.parse(await file.text()))
  );

  if (directory === 'definitions') {
    return parsedFiles.filter(isProviderDefinition) as T[];
  }

  return parsedFiles
    .flatMap((value) => value)
    .filter(isModelDefinition) as T[];
}

function isProviderDefinition(value: any): value is ProviderDefinition {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.kind === 'gateway' || value.kind === 'provider') &&
    typeof value.baseURL === 'string' &&
    typeof value.defaultModel === 'string'
  );
}

function isModelDefinition(value: any): value is ModelDefinition {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    !('baseURL' in value)
  );
}

function normalizeDefinition(definition: ProviderDefinition): ProviderDefinition {
  const setup = definition.setup ?? {
    requiresAuth: definition.apiKeyRequired !== false,
    authMode: definition.apiKeyRequired === false ? 'none' : 'api-key',
    credentialEnvVars: definition.credentialEnvVars,
  } as const;

  const catalog = definition.catalog ?? {
    source: definition.models ? 'static' : 'static',
    models: definition.models,
  } as const;

  return {
    ...definition,
    setup,
    transportConfig: definition.transportConfig ?? {
      kind: 'openai-compatible',
      openaiShim: {
        supportsApiFormatSelection: true,
        supportsAuthHeaders: false,
      },
    },
    catalog,
    apiKeyRequired: definition.apiKeyRequired ?? setup.requiresAuth,
    credentialEnvVars: definition.credentialEnvVars ?? setup.credentialEnvVars,
    models: definition.models ?? catalog.models,
  };
}

function resolveModel(
  model: ModelDefinition,
  definition?: ProviderDefinition
): ResolvedModelDefinition {
  return {
    ...model,
    apiName: model.apiName ?? model.id,
    providerId: definition?.id,
    providerName: definition?.name,
    providerKind: definition?.kind,
  };
}

const definitions = (await readJsonFiles<ProviderDefinition>('definitions'))
  .filter((definition): definition is ProviderDefinition => Boolean(definition))
  .map(normalizeDefinition)
  .sort((a, b) => a.name.localeCompare(b.name));

const globalModels = (await readJsonFiles<ModelDefinition | ModelDefinition[]>('models'))
  .flatMap((model) => model)
  .filter((model): model is ModelDefinition => Boolean(model))
  .sort((a, b) => a.id.localeCompare(b.id));

const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
const globalModelById = new Map(globalModels.map((model) => [model.id, model]));

export function listProviderDefinitions(): ProviderDefinition[] {
  return [...definitions];
}

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return definitionById.get(id);
}

export function listModelDefinitions(): ResolvedModelDefinition[] {
  const routeModels = definitions.flatMap((definition) =>
    (definition.catalog?.models ?? definition.models ?? []).map((model) => resolveModel(model, definition))
  );

  return [...globalModels.map((model) => resolveModel(model)), ...routeModels];
}

export function getModelDefinition(id: string): ModelDefinition | undefined {
  return globalModelById.get(id);
}

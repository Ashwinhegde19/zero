import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { configManager } from '../config/manager';
import { listProviderDefinitions } from '../providers/catalog';
import { discoverModelsForProvider } from '../providers/discovery';
import { isProviderRuntimeSupported } from '../providers/factory';
import type { ProviderDefinition, ResolvedModelDefinition } from '../providers/catalog/types';

type AddMode = 'choose' | 'catalog' | 'generic';

interface AddProviderProps {
  onDone: (providerName?: string) => void;
  onCancel: () => void;
}

const catalogProviders = listProviderDefinitions().filter(isProviderRuntimeSupported);

export const AddProvider: React.FC<AddProviderProps> = ({ onDone, onCancel }) => {
  const [mode, setMode] = useState<AddMode>('choose');
  const [selectedOption, setSelectedOption] = useState(0);
  const [selectedDefinition, setSelectedDefinition] = useState<ProviderDefinition | null>(null);
  const [catalogStep, setCatalogStep] = useState(0);

  const [catalogKey, setCatalogKey] = useState('');
  const [catalogModel, setCatalogModel] = useState('');
  const catalogModelTouched = React.useRef(false);
  const [modelOptions, setModelOptions] = useState<ResolvedModelDefinition[]>([]);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [discoveryStatus, setDiscoveryStatus] = useState('');

  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const totalOptions = catalogProviders.length + 1;
  const visibleModelStart = Math.max(
    0,
    Math.min(selectedModelIndex - 3, Math.max(0, modelOptions.length - 8))
  );
  const visibleModelOptions = modelOptions.slice(visibleModelStart, visibleModelStart + 8);

  React.useEffect(() => {
    if (mode !== 'catalog' || catalogStep !== 1 || !selectedDefinition) return;

    let cancelled = false;

    const loadModels = async () => {
      const staticModels = selectedDefinition.catalog?.models ?? selectedDefinition.models ?? [];
      setModelOptions(staticModels.map((model) => ({
        ...model,
        apiName: model.apiName ?? model.id,
        providerId: selectedDefinition.id,
        providerName: selectedDefinition.name,
        providerKind: selectedDefinition.kind,
      })));

      if (!selectedDefinition.catalog?.discovery) {
        setDiscoveryStatus(staticModels.length > 0 ? 'Using static catalog models.' : '');
        return;
      }

      setDiscoveryStatus('Discovering models...');
      const result = await discoverModelsForProvider(selectedDefinition.id, {
        apiKey: catalogKey.trim() || undefined,
      });

      if (cancelled || !result) return;

      setModelOptions(result.models);
      setDiscoveryStatus(
        result.error
          ? `Discovery ${result.source}: ${result.error}`
          : `Models loaded from ${result.source}.`
      );

      const firstModel = result.models[0];
      if (firstModel && !catalogModelTouched.current) {
        setCatalogModel(firstModel.apiName);
        setSelectedModelIndex(0);
      }
    };

    loadModels();

    return () => {
      cancelled = true;
    };
  }, [mode, catalogStep, selectedDefinition, catalogKey]);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'choose') {
        onCancel();
      } else {
        setMode('choose');
        setCatalogStep(0);
        setSelectedDefinition(null);
        setError('');
        setSuccess(false);
        setSelectedOption(0);
      }
      return;
    }

    if (mode === 'catalog' && catalogStep === 1 && modelOptions.length > 0) {
      if (key.upArrow) {
        setSelectedModelIndex((prev) => {
          const next = Math.max(0, prev - 1);
          catalogModelTouched.current = true;
          setCatalogModel(modelOptions[next]?.apiName ?? catalogModel);
          return next;
        });
        return;
      }

      if (key.downArrow) {
        setSelectedModelIndex((prev) => {
          const next = Math.min(modelOptions.length - 1, prev + 1);
          catalogModelTouched.current = true;
          setCatalogModel(modelOptions[next]?.apiName ?? catalogModel);
          return next;
        });
        return;
      }
    }

    if (mode !== 'choose') return;

    if (key.upArrow) {
      setSelectedOption((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedOption((prev) => Math.min(totalOptions - 1, prev + 1));
      return;
    }

    const chooseOption = (index: number) => {
      const definition = catalogProviders[index];
      if (definition) {
        setSelectedDefinition(definition);
        catalogModelTouched.current = false;
        setCatalogModel(definition.defaultModel);
        setModelOptions([]);
        setSelectedModelIndex(0);
        setDiscoveryStatus('');
        setMode('catalog');
        setCatalogStep(definition.apiKeyRequired === false ? 1 : 0);
      } else {
        setMode('generic');
      }
    };

    if (key.return) {
      chooseOption(selectedOption);
      return;
    }

    const quickNumber = parseInt(input, 10);
    if (!isNaN(quickNumber) && quickNumber >= 1 && quickNumber <= totalOptions) {
      chooseOption(quickNumber - 1);
    }
  });

  const saveCatalogProvider = () => {
    if (!selectedDefinition) return;

    if (selectedDefinition.apiKeyRequired !== false && !catalogKey.trim()) {
      setError('API key is required');
      return;
    }

    const profileName = selectedDefinition.id;

    configManager.addProvider({
      name: profileName,
      providerId: selectedDefinition.id,
      kind: selectedDefinition.kind,
      baseURL: selectedDefinition.baseURL,
      apiKey: catalogKey.trim() || undefined,
      model: catalogModel.trim() || selectedDefinition.defaultModel,
      description: selectedDefinition.name,
    });

    setSuccess(true);
    setTimeout(() => {
      onDone(profileName);
    }, 1200);
  };

  const saveGeneric = () => {
    if (!name.trim() || !baseURL.trim() || !model.trim()) {
      setError('Name, Base URL, and Model are required');
      return;
    }

    configManager.addProvider({
      name: name.trim(),
      kind: 'custom',
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim() || undefined,
      model: model.trim(),
      description: 'Custom OpenAI-compatible',
    });

    setSuccess(true);
    setTimeout(() => onDone(name.trim()), 1200);
  };

  if (mode === 'choose') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Add New Provider</Text>
        <Text color="gray">Esc to go back - Up/Down to navigate - Enter to select</Text>

        <Box marginY={1} flexDirection="column">
          {catalogProviders.map((definition, index) => (
            <Box key={definition.id} flexDirection="column" marginBottom={1}>
              <Text color={selectedOption === index ? 'greenBright' : 'white'}>
                {selectedOption === index ? '> ' : '  '}
                {index + 1}. Add {definition.name}
              </Text>
              {selectedOption === index && (
                <Text color="gray" dimColor>
                  {'   '}{definition.kind}: {definition.description}
                </Text>
              )}
            </Box>
          ))}

          <Text color={selectedOption === catalogProviders.length ? 'greenBright' : 'white'}>
            {selectedOption === catalogProviders.length ? '> ' : '  '}
            {catalogProviders.length + 1}. Add custom OpenAI-compatible provider
          </Text>
          {selectedOption === catalogProviders.length && (
            <Text color="gray" dimColor>
              {'   '}For providers not yet described by a catalog file
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  if (mode === 'catalog' && selectedDefinition) {
    if (success) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="greenBright" bold>
            {selectedDefinition.name} provider added successfully!
          </Text>
          <Text color="gray" dimColor>
            It is now your active provider.
          </Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Add {selectedDefinition.name}</Text>
        <Text color="gray">Esc to go back</Text>

        {catalogStep === 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="yellowBright">Step 1/2 - Enter API key</Text>
            <Box marginTop={1}>
              <Text>{selectedDefinition.apiKeyLabel ?? 'API key'}: </Text>
              <TextInput
                value={catalogKey}
                onChange={setCatalogKey}
                mask="*"
                placeholder={selectedDefinition.apiKeyPlaceholder}
              />
            </Box>
            {error && <Text color="red">{error}</Text>}
            <Box marginTop={1}>
              <Text color="gray" dimColor>Press Enter to continue</Text>
            </Box>
            <TextInput
              value=""
              onChange={() => {}}
              onSubmit={() => {
                if (selectedDefinition.apiKeyRequired === false || catalogKey.trim()) {
                  setCatalogStep(1);
                  setError('');
                } else {
                  setError('API key cannot be empty');
                }
              }}
            />
          </Box>
        )}

        {catalogStep === 1 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="yellowBright">Step 2/2 - Model name</Text>
            <Box marginTop={1}>
              <Text>Model: </Text>
              <TextInput
                value={catalogModel}
                onChange={(value) => {
                  catalogModelTouched.current = true;
                  setCatalogModel(value);
                }}
              />
            </Box>
            {selectedDefinition.models && selectedDefinition.models.length > 0 && (
              <Text color="gray" dimColor>
                Default catalog model: {selectedDefinition.defaultModel}
              </Text>
            )}
            {discoveryStatus && (
              <Text color="gray" dimColor>{discoveryStatus}</Text>
            )}
            {modelOptions.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color="gray" dimColor>Up/Down to choose a catalog model</Text>
                {visibleModelOptions.map((option, index) => {
                  const modelIndex = visibleModelStart + index;
                  return (
                  <Text
                    key={`${option.providerId ?? 'global'}:${option.apiName}`}
                    color={modelIndex === selectedModelIndex ? 'greenBright' : 'white'}
                  >
                    {modelIndex === selectedModelIndex ? '> ' : '  '}
                    {option.name ?? option.label ?? option.apiName}
                  </Text>
                  );
                })}
              </Box>
            )}
            {error && <Text color="red">{error}</Text>}
            <Box marginTop={1}>
              <Text color="gray" dimColor>Press Enter to save</Text>
            </Box>
            <TextInput
              value=""
              onChange={() => {}}
              onSubmit={saveCatalogProvider}
            />
          </Box>
        )}
      </Box>
    );
  }

  if (mode === 'generic') {
    if (success) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="greenBright" bold>
            Provider added successfully!
          </Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Add Custom Provider</Text>
        <Text color="gray">Esc to go back</Text>

        <Box marginTop={1}>
          <Text>Name: </Text>
          <TextInput value={name} onChange={setName} />
        </Box>
        <Box>
          <Text>Base URL: </Text>
          <TextInput value={baseURL} onChange={setBaseURL} />
        </Box>
        <Box>
          <Text>API Key: </Text>
          <TextInput value={apiKey} onChange={setApiKey} mask="*" />
        </Box>
        <Box>
          <Text>Model: </Text>
          <TextInput value={model} onChange={setModel} />
        </Box>

        {error && <Text color="red">{error}</Text>}

        <Box marginTop={1}>
          <Text color="gray">Press Enter to save</Text>
        </Box>

        <TextInput
          value=""
          onChange={() => {}}
          onSubmit={saveGeneric}
        />
      </Box>
    );
  }

  return null;
};

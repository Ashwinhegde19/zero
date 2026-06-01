import React from 'react';
import { Box, Text } from 'ink';

type Usage = {
  promptTokens: number;
  completionTokens: number;
};

interface HeaderProps {
  provider: string;
  model: string;
  usage: Usage;
  totalTokens: number;
  planMode: boolean;
}

export const Header: React.FC<HeaderProps> = ({ provider, model, usage, totalTokens, planMode }) => (
  <Box
    borderStyle="single"
    borderColor={planMode ? 'green' : 'gray'}
    paddingX={1}
    flexDirection="row"
    justifyContent="space-between"
  >
    <Box flexDirection="row">
      <Text color="cyanBright" bold>ZERO</Text>
      <Text color="gray" dimColor> local agent</Text>
      {planMode && <Text color="green"> - PLAN</Text>}
    </Box>
    <Box flexDirection="row">
      <Text color="cyan">{provider}</Text>
      <Text color="gray"> / </Text>
      <Text color="magenta">{model}</Text>
      <Text color="gray" dimColor>
        {' '}p:{usage.promptTokens} c:{usage.completionTokens} t:{totalTokens}
      </Text>
    </Box>
  </Box>
);

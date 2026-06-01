import React from 'react';
import { Box, Text } from 'ink';
import type { PlanItem } from '../tools/plan';

export const TodoRail: React.FC<{ plan: PlanItem[] }> = ({ plan }) => (
  <Box
    width={34}
    flexShrink={0}
    flexDirection="column"
    borderStyle="single"
    borderColor="gray"
    paddingX={1}
  >
    <Text color="green" bold>todo</Text>
    {plan.length === 0 ? (
      <Text color="gray" dimColor>No active plan yet.</Text>
    ) : (
      plan.map((item, index) => (
        <Box key={item.id || index} flexDirection="column" marginTop={1}>
          <Text color={planStatusColor(item.status)}>
            {index + 1}. {planStatusMark(item.status)} {item.content}
          </Text>
          {item.notes && (
            <Text color="gray" dimColor>
              {'   '}{item.notes}
            </Text>
          )}
        </Box>
      ))
    )}
  </Box>
);

export function planStatusMark(status: PlanItem['status']): string {
  switch (status) {
    case 'completed':
      return 'x';
    case 'in_progress':
      return '>';
    case 'failed':
      return '!';
    default:
      return 'o';
  }
}

export function planStatusColor(status: PlanItem['status']): 'green' | 'yellow' | 'red' | 'gray' {
  switch (status) {
    case 'completed':
      return 'green';
    case 'in_progress':
      return 'yellow';
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}

import { View } from 'react-native';

import { Text } from '@/shared/ui/text';

export function InstallStepsList({
  platformLabel,
  steps,
}: {
  platformLabel: string;
  steps: readonly string[];
}) {
  return (
    <View className="gap-6">
      <Text className="font-semibold">Install instructions</Text>
      <View className="gap-2">
        <Text variant="small" className="text-muted-foreground uppercase tracking-wide">
          {platformLabel}
        </Text>
        {steps.map((step, index) => (
          <Text key={step} variant="muted">
            {index + 1}. {step}
          </Text>
        ))}
      </View>
    </View>
  );
}

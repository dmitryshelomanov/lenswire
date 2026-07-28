import { View } from 'react-native';

import type { TrafficEntry } from '@/entities/traffic/types';
import { Text } from '@/shared/ui/text';

import { payloadUnavailableHint } from '../../lib/entry-display';
import { BodyView } from './body-view';
import { HeaderList } from './header-list';
import { OverrideActionLink } from './override-actions';
import { Section } from './section';

export function ResponseTab({ entry }: { entry: TrafficEntry }) {
  const unavailableHint = payloadUnavailableHint(entry);
  return (
    <View className="gap-6">
      {unavailableHint ? (
        <Section title="Capture level">
          <Text variant="muted">{unavailableHint}</Text>
        </Section>
      ) : null}
      <Section title="Headers">
        <HeaderList headers={entry.responseHeaders} />
      </Section>
      <Section
        title="Body"
        action={<OverrideActionLink entry={entry} kind="response" label="Mock" />}
      >
        <BodyView body={entry.responseBody} entry={entry} />
      </Section>
    </View>
  );
}

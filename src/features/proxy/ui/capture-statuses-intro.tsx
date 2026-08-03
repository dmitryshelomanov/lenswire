import * as React from 'react';
import { Modal, ScrollView, View } from 'react-native';

import {
  CAPTURE_STATUS_ITEMS,
  CAPTURE_STATUSES_INTRO,
} from '@/features/proxy/lib/capture-status-copy';
import { loadJson, saveJson } from '@/shared/lib/safe-async-storage';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Text } from '@/shared/ui/text';

const STORAGE_KEY = 'lenswire.captureStatusesIntroSeen';

function parseSeen(value: string | null): boolean | null {
  if (value == null) return false;
  try {
    return JSON.parse(value) === true;
  } catch {
    return false;
  }
}

export async function loadCaptureStatusesIntroSeen(): Promise<boolean> {
  const seen = await loadJson(STORAGE_KEY, parseSeen);
  return seen === true;
}

export function markCaptureStatusesIntroSeen(): void {
  saveJson(STORAGE_KEY, true);
}

export function CaptureStatusesIntro({
  open,
  onClose,
  markSeenOnClose = true,
}: {
  open: boolean;
  onClose: () => void;
  /** Persist the first-run flag when dismissing (default true). */
  markSeenOnClose?: boolean;
}) {
  const handleClose = React.useCallback(() => {
    if (markSeenOnClose) markCaptureStatusesIntroSeen();
    onClose();
  }, [markSeenOnClose, onClose]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/55 px-6">
        <View className="bg-background border-border w-full max-w-lg rounded-lg border p-4">
          <Text className="mb-1 text-base font-semibold">{CAPTURE_STATUSES_INTRO.title}</Text>
          <Text variant="muted" className="mb-1 text-sm">
            {CAPTURE_STATUSES_INTRO.lead}
          </Text>
          <Text variant="muted" className="mb-3 text-sm">
            {CAPTURE_STATUSES_INTRO.limits}
          </Text>
          <ScrollView className="max-h-80" bounces={false}>
            <View className="gap-3">
              {CAPTURE_STATUS_ITEMS.map((item) => (
                <View key={item.id} className="gap-1">
                  <Badge label={item.label} variant="outline" className="self-start" />
                  <Text variant="muted" className="text-sm">
                    {item.short}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Button className="mt-4" size="sm" onPress={handleClose}>
            <Text>Got it</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

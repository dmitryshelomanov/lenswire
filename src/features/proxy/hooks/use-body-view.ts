import * as React from 'react';

import type { TrafficBody } from '@/entities/traffic/types';
import { parseJsonTreeValue } from '@/shared/ui/json-tree';

import { looksLikeJson, prettyJsonText } from '../lib/body-text';
import { useCopiedFeedback } from './use-copied-feedback';

export type BodyViewMode = 'tree' | 'raw';

export function useBodyView(body: TrafficBody) {
  const [mode, setMode] = React.useState<BodyViewMode>('tree');
  const { copied, copy } = useCopiedFeedback();

  const rawText = body.text ?? '';
  const parsed =
    body.kind === 'json' || looksLikeJson(rawText) ? parseJsonTreeValue(rawText) : null;
  const showTree = parsed != null;
  const displayText = showTree ? prettyJsonText(rawText) : rawText;

  const copyBody = React.useCallback(() => {
    void copy(displayText);
  }, [copy, displayText]);

  return {
    mode,
    setMode,
    copied,
    copyBody,
    parsed,
    showTree,
    displayText,
  };
}

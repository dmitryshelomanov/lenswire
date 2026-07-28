import * as Clipboard from 'expo-clipboard';
import * as React from 'react';

const RESET_MS = 1500;

export function useCopiedFeedback() {
  const [copied, setCopied] = React.useState(false);
  const resetRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  const copy = React.useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setCopied(false), RESET_MS);
  }, []);

  return { copied, copy };
}

export type DetailTab = 'overview' | 'request' | 'response' | 'timing';

export const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'request', label: 'Request' },
  { key: 'response', label: 'Response' },
  { key: 'timing', label: 'Timing' },
];

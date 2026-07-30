import type { ToolbarFilters, TrafficFilterOption } from './types';

export function optionLabel<T extends string>(
  options: TrafficFilterOption<T>[],
  value: T,
  fallback = 'All',
): string {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

export function hasAdvancedFilters(filters: ToolbarFilters): boolean {
  return (
    filters.statusClass !== 'ALL' ||
    filters.scheme !== 'ALL' ||
    filters.captureMode !== 'ALL' ||
    Boolean(filters.overriddenOnly)
  );
}

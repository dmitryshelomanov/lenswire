import type { HttpMethod, TrafficFilters } from '@/entities/traffic/types';

export type TrafficFilterOption<T extends string = string> = {
  value: T;
  label: string;
};

export type MethodFilterValue = HttpMethod | 'ALL';
export type StatusFilterValue = TrafficFilters['statusClass'];
export type SchemeFilterValue = TrafficFilters['scheme'];
export type CaptureModeFilterValue = TrafficFilters['captureMode'];

export type ToolbarFilters = Pick<
  TrafficFilters,
  | 'method'
  | 'resourceType'
  | 'statusClass'
  | 'scheme'
  | 'captureMode'
  | 'overriddenOnly'
  | 'searchBodies'
>;

export type MoreFiltersPatch = Partial<
  Pick<TrafficFilters, 'statusClass' | 'scheme' | 'captureMode' | 'overriddenOnly' | 'searchBodies'>
>;

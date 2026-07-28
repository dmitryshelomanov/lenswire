import type { HttpMethod, ProbeType, ResourceType, StatusClass } from '@/entities/traffic/types';

export type FilterOption = { value: string; label: string };

export const METHODS: { value: HttpMethod | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'CONNECT', label: 'CONNECT' },
];

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'xhr', label: 'Fetch/XHR' },
  { value: 'grpc', label: 'gRPC' },
  { value: 'doc', label: 'Doc' },
  { value: 'css', label: 'CSS' },
  { value: 'js', label: 'JS' },
  { value: 'font', label: 'Font' },
  { value: 'img', label: 'Img' },
  { value: 'media', label: 'Media' },
  { value: 'other', label: 'Other' },
];

export const STATUS_CLASSES: { value: StatusClass | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' },
  { value: '4xx', label: '4xx' },
  { value: '5xx', label: '5xx' },
];

export const SCHEMES: { value: 'ALL' | 'http' | 'https'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];

export const CAPTURE_MODES: { value: 'ALL' | 'http' | 'mitm' | 'tunnel'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'http', label: 'HTTP' },
  { value: 'mitm', label: 'MITM' },
  { value: 'tunnel', label: 'TUNNEL' },
];

export const PROBE_OPTIONS: {
  type: ProbeType;
  label: string;
  pathHint: string;
  bodyHint?: string;
}[] = [
  { type: 'http_get', label: 'GET', pathHint: 'httpbin.org/get' },
  {
    type: 'post_json',
    label: 'POST JSON',
    pathHint: 'httpbin.org/post',
    bodyHint: 'application/json body',
  },
  {
    type: 'post_form_urlencoded',
    label: 'POST Form URL Encoded',
    pathHint: 'httpbin.org/post',
    bodyHint: 'application/x-www-form-urlencoded',
  },
  {
    type: 'post_multipart',
    label: 'POST Multipart Form',
    pathHint: 'httpbin.org/post',
    bodyHint: 'multipart/form-data + file part',
  },
  {
    type: 'get_image',
    label: 'GET Image',
    pathHint: 'httpbin.org/image/png',
    bodyHint: 'binary image response',
  },
];

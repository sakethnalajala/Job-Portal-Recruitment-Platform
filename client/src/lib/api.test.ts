import { describe, expect, it } from 'vitest';
import { normalizeApiUrl } from './api';

describe('normalizeApiUrl', () => {
  it('defaults to the same-origin prefix', () => {
    expect(normalizeApiUrl(undefined)).toBe('/api/v1');
    expect(normalizeApiUrl('')).toBe('/api/v1');
    expect(normalizeApiUrl('/api/v1')).toBe('/api/v1');
    expect(normalizeApiUrl('/api/v1/')).toBe('/api/v1');
  });

  it('appends the prefix to a bare host and never doubles it', () => {
    expect(normalizeApiUrl('https://job-portal-recruitment-platform.onrender.com')).toBe('https://job-portal-recruitment-platform.onrender.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/')).toBe('https://api.example.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/api')).toBe('https://api.example.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/api/v1')).toBe('https://api.example.com/api/v1');
    expect(normalizeApiUrl('https://api.example.com/api/v2/')).toBe('https://api.example.com/api/v2');
  });
});

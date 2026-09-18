import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';
import { tokenStore } from '@/lib/auth-token';
import { queryClient } from '@/lib/query-client';

// jsdom lacks matchMedia; theme hook needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom has no IntersectionObserver / ResizeObserver (framer-motion whileInView, recharts).
class ObserverStub { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
Object.assign(globalThis, { IntersectionObserver: ObserverStub, ResizeObserver: ObserverStub });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  tokenStore.clear();
  queryClient.clear();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});
afterAll(() => server.close());

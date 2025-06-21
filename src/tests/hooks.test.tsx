import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Create a wrapper for testing hooks with React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Mock implementation of a simple hook for testing
const useTestHook = () => {
  return { data: 'test data' };
};

describe('Hooks Testing Setup', () => {
  it('can render hooks with React Query', () => {
    const { result } = renderHook(() => useTestHook(), {
      wrapper: createWrapper(),
    });
    expect(result.current.data).toBe('test data');
  });
});
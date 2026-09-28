import type { ReactNode } from 'react';
import { isSurfaceConfigured } from '@/lib/server/llm';
import { PerformanceAiAvailabilityProvider } from '@/components/performance/PerformanceAiAvailability';

/**
 * Server shell of Rendimenti: it exists only to read, where the environment is visible, whether
 * the AI report's provider has a key (components/performance/PerformanceAiAvailability.tsx).
 */
export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <PerformanceAiAvailabilityProvider available={isSurfaceConfigured('PERFORMANCE_ANALYSIS')}>
      {children}
    </PerformanceAiAvailabilityProvider>
  );
}

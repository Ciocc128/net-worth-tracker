'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface AssistantLockedStateProps {
  title: string;
  description: string;
}

/**
 * Full-page gate for the two states in which the assistant cannot run:
 * demo mode and a deployment without ANTHROPIC_API_KEY. The page shell stays
 * visible; this replaces only the hero grid.
 */
export function AssistantLockedState({ title, description }: AssistantLockedStateProps) {
  const router = useRouter();

  return (
    <EmptyState
      icon={Lock}
      title={title}
      description={description}
      action={
        <Button variant="outline" onClick={() => router.back()}>
          Torna indietro
        </Button>
      }
      className="py-20"
    />
  );
}

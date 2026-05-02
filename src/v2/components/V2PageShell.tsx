import React from 'react';
import { cn } from '@/lib/utils';

export function V2PageShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full min-w-0', className)}>
      {children}
    </div>
  );
}

export function V2PageContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full min-w-0 px-4 py-4', className)}>
      {children}
    </div>
  );
}

export function V2WideScroll({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full min-w-0 overflow-x-auto', className)}>
      {children}
    </div>
  );
}

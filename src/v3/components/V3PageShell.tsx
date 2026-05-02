import type { ReactNode } from 'react';

export function V3PageShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full min-w-0 px-4 py-4 ${className}`}>
      {children}
    </div>
  );
}

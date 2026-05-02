import type { ReactNode } from 'react';

export function V3WideScroll({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full min-w-0 overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}

import { useEffect, useState } from 'react';

/** a largura da janela (o resumo lateral some abaixo de 900px) */
export function useLarguraDaJanela(): number {
  const [l, setL] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  useEffect(() => {
    const f = () => setL(window.innerWidth);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return l;
}

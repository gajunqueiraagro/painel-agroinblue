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

/** FECH-DOCS-02 — a altura da janela (o teto do diálogo que cresce até caber a lista) */
export function useAlturaDaJanela(): number {
  const [a, setA] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  useEffect(() => {
    const f = () => setA(window.innerHeight);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return a;
}

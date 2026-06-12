/**
 * BoletimContainer — moldura única do Boletim (substitui o papel do BlocoPadrao
 * na FASE 2). Mantém os 499px (height via token) + overflow:hidden — mesma
 * garantia do BlocoPadrao, agora com moldura + header oficiais.
 */
import { BOLETIM_TOKENS as T } from './tokens';
import { BoletimHeader } from './BoletimHeader';
import type { ReactNode } from 'react';

export function BoletimContainer({
  titulo, subtitulo, badge, logoUrl, children,
}: {
  titulo?: string; subtitulo?: string; badge?: ReactNode; logoUrl?: string; children: ReactNode;
}) {
  return (
    <div className={T.container} style={{ height: `${T.alturaPx}px` }}>
      <div className={T.padding + ' flex flex-col h-full min-h-0'}>
        {titulo && <BoletimHeader titulo={titulo} subtitulo={subtitulo} badge={badge} logoUrl={logoUrl} />}
        <div className={T.corpo}>{children}</div>
      </div>
    </div>
  );
}

/**
 * BoletimContainer — moldura única do Boletim (substitui o papel do BlocoPadrao).
 * Mantém os 499px (height via token) + overflow:hidden e repassa o cabeçalho
 * completo (incl. `tone`) ao BoletimHeader.
 */
import { BOLETIM_TOKENS as T, type BadgeTone } from './tokens';
import { BoletimHeader } from './BoletimHeader';
import type { ReactNode } from 'react';

export function BoletimContainer({
  titulo, subtitulo, badge, tone, logoUrl, hideLogo, className, children,
}: {
  titulo?: string; subtitulo?: string; badge?: ReactNode; tone?: BadgeTone;
  logoUrl?: string; hideLogo?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <div className={`${T.container} ${className ?? ''}`} style={{ height: `${T.alturaPx}px` }}>
      <div className={T.padding + ' flex flex-col h-full min-h-0'}>
        {titulo && (
          <BoletimHeader
            titulo={titulo} subtitulo={subtitulo} badge={badge}
            tone={tone} logoUrl={logoUrl} hideLogo={hideLogo}
          />
        )}
        <div className={T.corpo}>{children}</div>
      </div>
    </div>
  );
}

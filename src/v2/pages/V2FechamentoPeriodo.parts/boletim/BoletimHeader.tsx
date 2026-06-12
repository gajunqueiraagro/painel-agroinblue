/**
 * BoletimHeader — cabeçalho único do Boletim (título, subtítulo, badge, logo).
 * Criado na FASE 1 (fundação); consumido na FASE 2.
 */
import { BOLETIM_TOKENS as T } from './tokens';
import type { ReactNode } from 'react';

export function BoletimHeader({
  titulo, subtitulo, badge, logoUrl,
}: { titulo: string; subtitulo?: string; badge?: ReactNode; logoUrl?: string }) {
  return (
    <header className={T.headerWrap}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className={T.titulo}>{titulo}</h2>
          {badge && <span className={T.badge}>{badge}</span>}
        </div>
        {subtitulo && <p className={T.subtitulo}>{subtitulo}</p>}
      </div>
      {logoUrl && <img src={logoUrl} alt="" className="h-7 w-auto shrink-0 object-contain" />}
    </header>
  );
}

/**
 * BoletimHeader — cabeçalho único do Boletim (logo + título + subtítulo + badge
 * + divisória). REGRA OFICIAL: o logo AGROinBLUE é DEFAULT do Header (todo bloco
 * migrado herda o mesmo cabeçalho automaticamente). `logoUrl` só sobrescreve a
 * origem; `hideLogo` é o opt-in raro de esconder.
 */
import { BOLETIM_TOKENS as T } from './tokens';
import logo from '@/assets/logo.png';
import type { ReactNode } from 'react';

export function BoletimHeader({
  titulo, subtitulo, badge, logoUrl, hideLogo = false,
}: {
  titulo: string; subtitulo?: string; badge?: ReactNode;
  logoUrl?: string; hideLogo?: boolean;
}) {
  const src = logoUrl ?? logo;
  return (
    <header className={T.headerWrap}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className={T.titulo}>{titulo}</h2>
          {badge && <span className={T.badge}>{badge}</span>}
        </div>
        {subtitulo && <p className={T.subtitulo}>{subtitulo}</p>}
      </div>
      {!hideLogo && <img src={src} alt="" className="h-7 w-auto shrink-0 object-contain" />}
    </header>
  );
}

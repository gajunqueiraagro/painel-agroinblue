/**
 * BoletimHeader — cabeçalho único do Boletim (logo + título + subtítulo + badge
 * + divisória). Logo é DEFAULT. O `tone` muda SÓ a cor do badge (formato/fonte/
 * padding/radius/posição vêm do token e são idênticos entre tones).
 */
import { BOLETIM_TOKENS as T, type BadgeTone } from './tokens';
import logo from '@/assets/logo.png';
import type { ReactNode } from 'react';

const TONE_CORES: Record<BadgeTone, string> = {
  neutral:     'bg-muted text-muted-foreground',
  operacional: 'bg-emerald-100 text-emerald-700',
  competencia: 'bg-blue-100 text-blue-700',
  financeiro:  'bg-indigo-100 text-indigo-800',
  auditoria:   'bg-purple-100 text-purple-700',
};

export function BoletimHeader({
  titulo, subtitulo, badge, tone = 'neutral', logoUrl, hideLogo = false,
}: {
  titulo: string; subtitulo?: string; badge?: ReactNode; tone?: BadgeTone;
  logoUrl?: string; hideLogo?: boolean;
}) {
  const src = logoUrl ?? logo;
  return (
    <header className={T.headerWrap}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className={T.titulo}>{titulo}</h2>
          {badge && <span className={`${T.badge} ${TONE_CORES[tone]}`}>{badge}</span>}
        </div>
        {subtitulo && <p className={T.subtitulo}>{subtitulo}</p>}
      </div>
      {!hideLogo && <img src={src} alt="" className="h-7 w-auto shrink-0 object-contain" />}
    </header>
  );
}

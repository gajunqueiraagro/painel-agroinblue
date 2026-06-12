/**
 * BoletimPlaceholder — estado "em construção" oficial do Boletim.
 * Usa o BoletimContainer (moldura + header) com corpo placeholder.
 * API estendida (subtitulo/badge/tone) só repassa ao Container — corpo intocado.
 */
import type { ReactNode } from 'react';
import { BoletimContainer } from './BoletimContainer';
import type { BadgeTone } from './tokens';

export function BoletimPlaceholder({
  titulo,
  descricao,
  subtitulo,
  badge,
  tone,
}: {
  titulo: string;
  descricao?: string;
  subtitulo?: string;
  badge?: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <BoletimContainer titulo={titulo} subtitulo={subtitulo} badge={badge} tone={tone}>
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">🚧 Em construção</span>
        {descricao && <p className="text-xs max-w-[80%] leading-snug">{descricao}</p>}
      </div>
    </BoletimContainer>
  );
}

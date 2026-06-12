/**
 * BoletimPlaceholder — estado "em construção" oficial do Boletim.
 * Usa o BoletimContainer (moldura + header) com corpo placeholder.
 */
import { BoletimContainer } from './BoletimContainer';

export function BoletimPlaceholder({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <BoletimContainer titulo={titulo}>
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">🚧 Em construção</span>
        {descricao && <p className="text-xs max-w-[80%] leading-snug">{descricao}</p>}
      </div>
    </BoletimContainer>
  );
}

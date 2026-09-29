/**
 * Nome de arquivo numa linha só — FIN-NFE-PARCELAS-01 PR 2b-fix1, movido de `DocumentosPendentes.tsx` no fix2
 * para servir também à grade de parcelas e ao "Anexar vários boletos" (uma célula só, nunca uma segunda versão).
 * A regra (fim fixo com a extensão, começo encolhendo) mora em `partesDoNome`; quem usa põe o nome inteiro no
 * `title` da célula, com `overflow-hidden whitespace-nowrap`.
 */
import { partesDoNome } from '@/lib/financeiro/documentosPendentes';

/** Começo que encolhe (com "…" só quando não cabe) + fim sempre visível. */
export function NomeDoArquivo({ nome }: { nome: string }) {
  const { inicio, fim } = partesDoNome(nome);
  return (
    <span className="flex min-w-0">
      <span className="min-w-0 overflow-hidden text-ellipsis" data-testid="arquivo-inicio">{inicio}</span>
      <span className="shrink-0" data-testid="arquivo-fim">{fim}</span>
    </span>
  );
}

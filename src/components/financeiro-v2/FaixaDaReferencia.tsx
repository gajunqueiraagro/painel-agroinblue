/**
 * CRIAR-DO-EXTRATO-01 — A REFERÊNCIA DE ONDE O LANÇAMENTO NASCEU, EM UMA LINHA (Gabriel, 20/10/2026). Substitui o bloco
 * "📋 Referência operacional usada" (5 linhas, que empurrava o formulário e fazia o modal rolar) nos três caminhos que o montam:
 * o extrato ("Criar lançamento pela diferença" / Criar pela linha), a planilha (Conciliar extrato com referência do Excel) e a
 * referência operacional (relatório de custeio).
 *
 *   "Do extrato: <histórico> · dd/mm/aaaa · R$ valor · <conta>"   (ou "Da planilha:" / "Da referência:")
 *
 * 22px, 11px, sem emoji, na LINHA DAS ABAS do modal (à direita delas, com a Geral aberta: não soma altura ao corpo). O texto longo ROLA dentro da faixa (`uma-linha-que-rola`, nunca "…"); o ⓘ no fim tem tudo no `title`:
 * observação, fornecedor/fazenda/plano/centro da planilha, data e valor originais e a frase de uso. Datas sempre dd/mm/aaaa.
 * Puramente informativa: não resolve nada por nome; fornecedor, fazenda e classificação são escolhidos pelo operador.
 */
import { Info } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';

export type OrigemDaReferencia = 'extrato' | 'planilha' | 'referencia';

export interface ReferenciaOperacionalInfo {
  /** De onde veio: muda só o prefixo. Ausente = "Da referência". */
  origem?: OrigemDaReferencia;
  fornecedor_texto?: string | null;
  fazenda_texto?: string | null;
  plano_texto?: string | null;
  centro_texto?: string | null;
  produto_texto?: string | null;
  observacao?: string | null;
  valor?: number | null;
  data_referencia?: string | null;
  /** O nome da conta bancária do movimento (extrato). */
  conta_nome?: string | null;
}

export const PREFIXO_DA_ORIGEM: Record<OrigemDaReferencia, string> = {
  extrato: 'Do extrato', planilha: 'Da planilha', referencia: 'Da referência',
};
export const FRASE_DE_USO = 'Use como referência; fornecedor, fazenda e classificação são escolhidos por você.';

/** dd/mm/aaaa a partir de 'aaaa-mm-dd' (ou de um timestamp); o que não for data ISO passa como veio. */
export function dataDaReferencia(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

/** O texto da linha — as partes que existem, na ordem, separadas por " · ". */
export function textoDaFaixa(r: ReferenciaOperacionalInfo): string {
  const historico = r.produto_texto || r.fornecedor_texto || r.observacao || null;
  const partes = [historico, dataDaReferencia(r.data_referencia), r.valor != null ? formatMoeda(r.valor) : null, r.conta_nome || null]
    .filter((p): p is string => !!p && p.trim() !== '');
  return `${PREFIXO_DA_ORIGEM[r.origem ?? 'referencia']}: ${partes.join(' · ')}`;
}

/** O `title` do ⓘ: o que a linha não mostra, uma informação por linha, e a frase de uso no fim. */
export function detalheDaFaixa(r: ReferenciaOperacionalInfo): string {
  const sufixo = r.origem === 'planilha' ? ' (planilha)' : '';
  const linhas = [
    r.observacao ? `Observação${sufixo}: ${r.observacao}` : null,
    r.fornecedor_texto ? `Fornecedor${sufixo}: ${r.fornecedor_texto}` : null,
    r.fazenda_texto ? `Fazenda${sufixo}: ${r.fazenda_texto}` : null,
    r.plano_texto ? `Plano${sufixo}: ${r.plano_texto}` : null,
    r.centro_texto ? `Centro${sufixo}: ${r.centro_texto}` : null,
    r.data_referencia ? `Data original: ${dataDaReferencia(r.data_referencia)}` : null,
    r.valor != null ? `Valor original: ${formatMoeda(r.valor)}` : null,
    FRASE_DE_USO,
  ];
  return linhas.filter((l): l is string => !!l).join('\n');
}

export function FaixaDaReferencia({ referencia, className }: { referencia: ReferenciaOperacionalInfo; className?: string }) {
  const texto = textoDaFaixa(referencia);
  const detalhe = detalheDaFaixa(referencia);
  return (
    <div data-testid="faixa-da-referencia"
      className={cn('flex h-[22px] min-w-0 shrink-0 items-center gap-1.5 rounded border border-blue-200 bg-blue-50/70 px-2 text-[11px] text-blue-900 dark:bg-blue-950/30 dark:text-blue-200', className)}>
      <span className="uma-linha-que-rola min-w-0 flex-1 leading-[20px]" data-testid="faixa-da-referencia-texto">{texto}</span>
      <span className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center text-blue-700" title={detalhe}
        aria-label={detalhe} data-testid="faixa-da-referencia-info" tabIndex={0}>
        <Info className="h-3.5 w-3.5" aria-hidden />
      </span>
    </div>
  );
}

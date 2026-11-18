/**
 * CONC-CRIAR-COM-NOTA-02 E2 (homologação 09:48, caso Edson: 5 NFs num PIX de −6.000,00) — o "Casar com o banco" com N lançamentos é uma
 * TABELA, UMA LINHA POR LANÇAMENTO (o desenho do Casar do mock do processo do Code 2, `fin-baixa-01-processo-v2` p2b): o EXTRATO numa faixa
 * de largura total em cima; Venc. · Descrição · Fornecedor · NF · Status · Valor · Aplicado (editável) · Fica (inteira / parcial · falta /
 * a mais) · ✕; o rodapé com o total aplicado × o extrato × a diferença.
 * Só DESENHA: o valor de cada campo e o remover são do modal (o mesmo estado `levados`, o mesmo Conciliar — nada de regra nova de gravação).
 * Regra de corte: tabela — texto com "…" e o inteiro no `title`; número, valor, data e NF nunca cortam (larguras medidas para o teto).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import { STATUS_FILTRO_LABEL, STATUS_PALETA } from '@/lib/financeiro/statusFinanceiro';

export interface LinhaDoLevado {
  lancamento_id: string; data_vencimento?: string | null; descricao: string | null; fornecedor?: string | null;
  numero_documento?: string | null; status_transacao?: string | null; valor_assinado: number; valorTexto: string;
}
/* as larguras: Venc. dd/mm/aaaa 72 · NF 000.000.000 84 · Status 76 · Valor/Aplicado "99.999.999,99" 96/104 · Fica "parcial · falta 99.999.999,99" 150 */
/* ajuste 2 (OK do Edson): sem vão entre Fica e ✕ — o ✕ vai NA célula do Fica, logo depois do selo; a coluna tem a largura do MAIOR texto que o
   conjunto pode mostrar ("parcial · falta <o maior valor>"), fixa enquanto se edita (nada anda); a sobra vai para a Descrição */
export const COLUNAS_DOS_LEVADOS: readonly (number | null)[] = [72, null, 150, 84, 76, 96, 124];
/** a largura do Fica + ✕ para este conjunto: o selo mais largo possível (10px tabular ≈ 5,6 px por caractere + recuos) + o ✕ */
export function larguraDoFica(levados: readonly { valor_assinado: number }[]): number {
  const maior = Math.max(0, ...levados.map((l) => Math.abs(l.valor_assinado)));
  const texto = `parcial · falta ${fmt(maior)}`;
  return Math.ceil(texto.length * 5) + 12 + 20;
}
const PALETA: Record<string, { texto: string } | undefined> = {
  previsto: STATUS_PALETA.previsto, programado: STATUS_PALETA.programado, agendado: STATUS_PALETA.agendado,
  realizado: STATUS_PALETA.realizado, conciliado: STATUS_PALETA.conciliado,
};
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
export const valorDoCampo = (t: string) => Number(t.replace(/\./g, '').replace(',', '.')) || 0;

/** o que fica de cada lançamento depois do casar: inteira (aplicado = valor), parcial (falta), a mais (aplicado > valor) */
export function oQueFica(valor: number, aplicado: number): { texto: string; classe: string; tipo: 'inteira' | 'parcial' | 'a_mais' } {
  const d = Math.round((Math.abs(aplicado) - Math.abs(valor)) * 100) / 100;
  if (Math.abs(d) < 0.005) return { tipo: 'inteira', texto: 'inteira', classe: 'bg-emerald-50 text-emerald-700' };
  if (d < 0) return { tipo: 'parcial', texto: `parcial · falta ${fmt(-d)}`, classe: 'bg-amber-50 text-amber-800' };
  return { tipo: 'a_mais', texto: `a mais ${fmt(d)}`, classe: 'bg-rose-50 text-rose-700' };
}

export function TabelaDosLevados({ extrato, nomeConta, levados, onValor, onRemover, somenteLeitura, rotuloDoCampo, acaoNoCampo }: {
  extrato: { data: string | null; historico: string | null; valor: number };
  nomeConta?: string | null;
  levados: readonly LinhaDoLevado[];
  onValor: (id: string, texto: string) => void;
  onRemover: (id: string) => void;
  /** o campo que não se edita (ex.: o juro do pós-fixado, que o banco diz) */
  somenteLeitura?: (id: string) => boolean;
  rotuloDoCampo?: (l: LinhaDoLevado) => string;
  /** o gesto do modal colado ao campo (o "absorver a diferença", ⇆) */
  acaoNoCampo?: (l: LinhaDoLevado) => ReactNode;
}) {
  const aplicado = levados.reduce((t, l) => t + valorDoCampo(l.valorTexto), 0);
  const banco = Math.abs(extrato.valor);
  const dif = Math.round((aplicado - banco) * 100) / 100;
  const inteiras = levados.filter((l) => oQueFica(l.valor_assinado, valorDoCampo(l.valorTexto)).tipo === 'inteira').length;
  const parciais = levados.filter((l) => oQueFica(l.valor_assinado, valorDoCampo(l.valorTexto)).tipo === 'parcial').length;
  /* D1 (homologação 14:32): a fonte e a linha DAS SUGESTÕES (a lista do Financeiro) — cabeçalho 8px caixa alta, texto 9px, linha 19px */
  const th = 'h-[18px] px-1 text-[8px] font-semibold uppercase leading-tight';
  const cor = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
  return (
    <div className="space-y-1.5" data-testid="tabela-dos-levados">
      {/* o EXTRATO: faixa de largura total (uma tabela de 1 linha: o histórico longo corta só no fim, com o title) */}
      <table className="w-full table-fixed border-separate border-spacing-0 rounded bg-muted/60 text-[9px]" data-testid="levados-extrato">
        <colgroup><col style={{ width: 56 }} /><col style={{ width: 72 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 104 }} /></colgroup>
        <tbody><tr className="h-[22px]">
          <td className="px-1 font-semibold text-muted-foreground">Extrato</td>
          <td className="whitespace-nowrap px-1 tabular-nums">{dataBR(extrato.data)}</td>
          <td className="truncate px-1 font-medium" title={extrato.historico ?? undefined} data-testid="levados-extrato-historico">{extrato.historico ?? '—'}</td>
          <td className="truncate px-1 text-muted-foreground" title={nomeConta ?? undefined}>{nomeConta ?? ''}</td>
          <td className={cn('whitespace-nowrap px-1 text-right text-[11px] font-semibold tabular-nums', cor(extrato.valor))} data-testid="levados-extrato-valor">{fmt(extrato.valor)}</td>
        </tr></tbody>
      </table>

      <table className="w-full table-fixed border-separate border-spacing-0 text-[9px]" data-testid="levados-tabela">
        <colgroup>{COLUNAS_DOS_LEVADOS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}<col style={{ width: larguraDoFica(levados) }} /></colgroup>
        <thead><tr className="bg-primary text-primary-foreground">
          <th className={cn(th, 'text-center')}>Venc.</th><th className={cn(th, 'text-left')}>Descrição</th><th className={cn(th, 'text-left')}>Fornecedor</th>
          <th className={cn(th, 'text-right')}>NF</th><th className={cn(th, 'text-center')}>Status</th><th className={cn(th, 'text-right')}>Valor</th>
          <th className={cn(th, 'text-right')}>Aplicado</th><th className={cn(th, 'text-left')}>Fica</th>
        </tr></thead>
        <tbody>
          {levados.length === 0 && (
            <tr className="h-[19px]"><td colSpan={8} className="px-1 italic text-muted-foreground" data-testid="levados-vazio">nenhum lançamento levado</td></tr>
          )}
          {levados.map((l) => {
            const st = (l.status_transacao ?? '').trim().toLowerCase();
            const fica = oQueFica(l.valor_assinado, valorDoCampo(l.valorTexto));
            const nf = l.numero_documento ? (formatNFNumber(l.numero_documento) || l.numero_documento) : '—';
            return (
              <tr key={l.lancamento_id} className="h-[19px] border-b" data-testid="levado-linha">
                <td className="whitespace-nowrap border-b px-1 text-center tabular-nums">{dataBR(l.data_vencimento)}</td>
                <td className="truncate border-b px-1" title={l.descricao ?? undefined}>{l.descricao ?? '—'}</td>
                <td className="truncate border-b px-1 text-muted-foreground" title={l.fornecedor ?? undefined}>{l.fornecedor || '—'}</td>
                <td className="whitespace-nowrap border-b px-1 text-right tabular-nums" data-testid="levado-linha-nf">{nf}</td>
                <td className={cn('whitespace-nowrap border-b px-1 text-center font-medium', PALETA[st]?.texto ?? 'text-muted-foreground')}>
                  {st ? (STATUS_FILTRO_LABEL[st] ?? l.status_transacao) : '—'}
                </td>
                <td className={cn('whitespace-nowrap border-b px-1 text-right tabular-nums', cor(l.valor_assinado))}>{fmt(l.valor_assinado)}</td>
                <td className="border-b px-0.5"><div className="flex items-center gap-0.5">
                  <input value={l.valorTexto} readOnly={somenteLeitura?.(l.lancamento_id)} inputMode="decimal"
                    onChange={(e) => onValor(l.lancamento_id, e.target.value)}
                    aria-label={rotuloDoCampo?.(l) ?? `Valor aplicado em ${l.descricao ?? 'lançamento'}`}
                    className={cn('h-[17px] w-full min-w-0 rounded border px-1 text-right text-[9px] font-medium tabular-nums', cor(l.valor_assinado))}
                    data-testid="levado-linha-aplicado" />
                  {acaoNoCampo?.(l)}
                </div></td>
                <td className="whitespace-nowrap border-b px-1">
                  <span className={cn('whitespace-nowrap rounded px-1.5 py-[1px] text-[9px] tabular-nums', fica.classe)} data-testid="levado-linha-fica">{fica.texto}</span>
                  <button type="button" onClick={() => onRemover(l.lancamento_id)} aria-label={`Remover ${l.descricao ?? 'lançamento'} deste casamento`}
                    title="Tira este lançamento do casamento. Nada é apagado." className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    data-testid="levado-linha-remover">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* o rodapé: total aplicado × extrato × diferença (o que o Conciliar vai conferir) */}
      <table className="w-full table-fixed border-separate border-spacing-0 rounded bg-primary text-[9.5px] text-primary-foreground" data-testid="levados-rodape">
        <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 70 }} /><col style={{ width: 120 }} /><col style={{ width: 76 }} /><col style={{ width: 110 }} /></colgroup>
        <tbody><tr className="h-[22px]">
          <td className="truncate px-2" title={`${levados.length} lançamentos · ${inteiras} inteiras · ${parciais} parciais`}>
            {levados.length} lançamento{levados.length === 1 ? '' : 's'} · {inteiras} inteira{inteiras === 1 ? '' : 's'}{parciais ? ` + ${parciais} parcial${parciais === 1 ? '' : 's'}` : ''}
          </td>
          <td className="whitespace-nowrap px-1 text-right">aplicado <b className="tabular-nums" data-testid="levados-total-aplicado">{fmt(aplicado)}</b></td>
          <td className="px-1 text-right opacity-80">extrato</td>
          <td className="whitespace-nowrap px-1 text-right font-semibold tabular-nums">{fmt(banco)}</td>
          <td className="px-1 text-right opacity-80">diferença</td>
          <td className={cn('whitespace-nowrap px-2 text-right font-semibold tabular-nums', Math.abs(dif) < 0.005 ? 'text-emerald-300' : 'text-amber-300')}
            data-testid="levados-diferenca">{fmt(dif)}</td>
        </tr></tbody>
      </table>
    </div>
  );
}


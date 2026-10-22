/**
 * A CONTA DE CADA ITEM DA NOTA — FIN-CLASSIF-DIVIDIDA-01b (mock aprovado 22/10 08h21, vista 1 "Itens -> conta"). A vista "Contas" da aba
 * Itens da nota: cada item ganha a sua conta (o seletor do plano, com busca; a sugestao aprendida quando ha'; sem ela, a conta de hoje do
 * lancamento), o resumo soma POR CONTA e "Dividir o lancamento em N contas" chama `fn_lancamento_dividir_pelos_itens` (motivo
 * obrigatorio; o banco soma, divide e recusa com a frase pronta). Item sem conta impede, com a frase. Sem rolagem ate' ~18 itens: a
 * tabela tem a fonte dos itens (8,5px, linha 14px) e o quadro rola dentro so' alem disso.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { QUADRO_REGUA } from '@/components/ui/regua-tabela';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ItemFiscal } from '@/lib/financeiro/nfe/itensDaNota';
import { reais } from '@/lib/financeiro/nfe/formatos';
import { porContaDosItens, porQueNaoDivideOsItens } from '@/lib/financeiro/divisaoDaClassificacao';
import { cn } from '@/lib/utils';

/** As cores das contas na ordem (a barra, o ponto do item e o resumo usam a MESMA). */
export const CORES_DAS_CONTAS = ['#1f4e8c', '#d97706', '#0f766e', '#9333ea', '#be123c', '#4d7c0f'];
const TH = 'h-[16px] px-1 py-0 text-[8.5px] font-medium text-primary-foreground normal-case tracking-normal whitespace-nowrap';
const TD = 'h-[14px] px-1 py-0 text-[8.5px] leading-none';
/* o gatilho do seletor de conta cabe na linha de 14px */
const GATILHO = 'h-[12px] rounded-sm px-1 text-[8px] leading-none [&_svg]:h-2 [&_svg]:w-2';
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function ContaDoItem({ valor, classificacoes, tipoOperacao, onEscolher, nItem, disabled }: {
  valor: string; classificacoes: ClassificacaoItem[]; tipoOperacao: string; onEscolher: (planoContaId: string) => void; nItem: number; disabled?: boolean;
}) {
  const [busca, setBusca] = useState('');
  const sub = classificacoes.find((c) => c.id === valor)?.subcentro ?? '';
  return (
    <div data-testid={`conta-do-item-${nItem}`}>
      <PlanoSubcentroSelect value={sub} onChange={() => undefined} onSelected={(_s, cls) => { if (cls?.id) onEscolher(cls.id); }}
        classificacoes={classificacoes} tipoOperacao={tipoOperacao} search={busca} onSearchChange={setBusca} disabled={disabled}
        triggerClassName={GATILHO} itemClassName="text-[10.5px]" />
    </div>
  );
}

export function ContasDosItens({ itens, classificacoes, tipoOperacao, contaDeHoje, sugeridas, gravando, somenteLeitura, onDividir }: {
  itens: readonly Pick<ItemFiscal, 'nItem' | 'descricao' | 'liquidoCent'>[];
  classificacoes: ClassificacaoItem[];
  tipoOperacao: string;
  /** a conta de hoje do lancamento (o ponto de partida de todo item sem sugestao) */
  contaDeHoje: string | null;
  /** a sugestao aprendida (`sugestaoDeContaDosItens`) */
  sugeridas: ReadonlyMap<number, string>;
  gravando: boolean;
  somenteLeitura?: boolean;
  /** pede o motivo e chama o banco (quem chama e' o modal) */
  onDividir: (mapa: ReadonlyMap<number, string>) => void;
}) {
  const inicial = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of itens) { const c = sugeridas.get(i.nItem) ?? contaDeHoje; if (c) m.set(i.nItem, c); }
    return m;
  }, [itens, sugeridas, contaDeHoje]);
  const [mapa, setMapa] = useState<ReadonlyMap<number, string>>(inicial);
  useEffect(() => { setMapa(inicial); }, [inicial]);
  const porConta = porContaDosItens(itens, mapa);
  const recusa = porQueNaoDivideOsItens(itens, mapa);
  const cor = (plano: string) => CORES_DAS_CONTAS[Math.max(0, porConta.findIndex((c) => c.planoContaId === plano)) % CORES_DAS_CONTAS.length];
  const nome = (plano: string) => classificacoes.find((c) => c.id === plano)?.subcentro ?? '—';
  const somaCent = itens.reduce((s, i) => s + i.liquidoCent, 0);
  const deHoje = contaDeHoje ? nome(contaDeHoje) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5" data-testid="contas-dos-itens">
      {/* ── o resumo POR CONTA numa faixa so' (a altura vai para os itens: 18 sem rolar a partir de 1126x579): a barra fina; as contas
          (nome · R$ · %) ou, quando nao anda, a frase; e o botao ─────────────────────────────────────────────────────────────── */}
      <div className="shrink-0 rounded-lg border bg-card px-2 py-1" data-testid="contas-resumo">
        <div className="flex h-[6px] overflow-hidden rounded-sm bg-muted" data-testid="contas-barra">
          {porConta.map((c) => <span key={c.planoContaId} className="h-full" style={{ width: `${c.percentual}%`, background: cor(c.planoContaId) }} title={`${nome(c.planoContaId)} · ${pct(c.percentual)}`} />)}
        </div>
        <div className="mt-1 flex h-[20px] min-w-0 items-center gap-2 text-[9.5px] leading-none">
          {recusa ? (
            <span className="min-w-0 flex-1 uma-linha-que-rola text-amber-800" data-testid="contas-frase" title={recusa}>{recusa}</span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" data-testid="contas-frase"
              title={`Soma dos itens R$ ${reais(somaCent)} em ${porConta.length} contas${deHoje ? ` · hoje o lançamento está em 1 conta (${deHoje})` : ''}`}>
              {porConta.map((c) => (
                <span key={c.planoContaId} className="flex min-w-0 shrink items-center gap-1" data-testid="contas-resumo-conta"
                  title={`${nome(c.planoContaId)} · R$ ${reais(c.liquidoCent)} · ${pct(c.percentual)} · ${c.itens} ${c.itens === 1 ? 'item' : 'itens'}`}>
                  <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor(c.planoContaId) }} />
                  <span className="min-w-0 truncate">{nome(c.planoContaId)}</span>
                  <b className="shrink-0 whitespace-nowrap tabular-nums">R$ {reais(c.liquidoCent)} · {pct(c.percentual)}</b>
                </span>
              ))}
            </span>
          )}
          <Button type="button" size="sm" className="h-[20px] w-[190px] shrink-0 px-2 text-[10px]" disabled={!!recusa || gravando || somenteLeitura}
            onClick={() => onDividir(mapa)} data-testid="contas-dividir">
            {gravando ? 'Dividindo…' : `Dividir o lançamento em ${Math.max(2, porConta.length)} contas`}
          </Button>
        </div>
      </div>

      {/* ── os itens: Nº · Descrição · Líquido · Conta ───────────────────────────────────────────────────────────────────── */}
      <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')} data-testid="contas-quadro">
        <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
          <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 250 }} /></colgroup>
          <thead><tr>
            <th className={cn(TH, 'text-right')}>Nº</th><th className={cn(TH, 'text-left')}>Descrição na nota</th>
            <th className={cn(TH, 'text-right')}>Líquido</th><th className={cn(TH, 'text-left')}>Conta</th>
          </tr></thead>
        </table>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 250 }} /></colgroup>
            <tbody>
              {itens.map((i) => {
                const c = mapa.get(i.nItem) ?? '';
                return (
                  <tr key={i.nItem} className="border-b border-border/50 even:bg-muted/30" data-testid="contas-linha">
                    <td className={cn(TD, 'text-right tabular-nums text-muted-foreground')}>{i.nItem}</td>
                    <td className={cn(TD, 'truncate')} title={i.descricao}>{i.descricao}</td>
                    <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{reais(i.liquidoCent)}</td>
                    <td className={TD}>
                      <div className="flex min-w-0 items-center gap-1">
                        <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: c ? cor(c) : 'transparent', outline: c ? undefined : '1px dashed #d97706' }} />
                        <div className="min-w-0 flex-1">
                          <ContaDoItem nItem={i.nItem} valor={c} classificacoes={classificacoes} tipoOperacao={tipoOperacao} disabled={somenteLeitura || gravando}
                            onEscolher={(p) => setMapa((m) => new Map(m).set(i.nItem, p))} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

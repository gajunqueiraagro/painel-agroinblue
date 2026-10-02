/**
 * O EXTRATO DA PLANILHA — PR-CONC-ENRIQUECER-V2-01, quadro 2 do mock.
 *
 * A Conferência OFX × Sistema com a PLANILHA no lugar do banco. Esquerda: Data · "Conta do plano · Fornecedor" · Valor;
 * no meio, a coluna de 26px do símbolo (✓ ≈ ≠ ○ ! ↳); direita: Valor · Data · descrição · fornecedor · origem (B/✓/M) ·
 * selo · "⋯". Linhas por dia, com o fecho do dia ("confere" / "difere R$ X"); totais no topo; legenda; "Só não
 * enriquecidos"; fundo verde-claro na linha já enriquecida.
 *
 * ⚠ A MONTAGEM É A DA CONFERÊNCIA (`montarExtratoDaPlanilha` → `montarMesa`), e as medidas também: linha de 18px, 10px
 *   no corpo, 9,5px no cabeçalho navy, cabeçalho e totais congelados, só o corpo rola, nada quebra.
 * ⚠ PLANILHA = REFERÊNCIA, SISTEMA = VERDADE (PR-CONC-ENRIQUECER-V2-02): o cabeçalho diz isso (azul-claro × navy); o dia
 *   FECHA no fim, como na Conferência ("fechamento DD/MM", o mesmo par de tokens), e o fechamento do MÊS fica congelado
 *   abaixo do corpo.
 * ⚠ CLICAR NA LINHA (ou no "⋯") ABRE A MESA NAQUELA LINHA, por cima deste modal: ele continua montado, e fechar a Mesa
 *   volta ao MESMO ponto da rolagem.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import { useEspelhadosReais } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { useEspelhoInternas } from '@/hooks/useEspelhoInternas';
import { contaDaLinhaStaging } from '@/v2/lib/mesa/enriquecimentoView';
import {
  LEGENDA_SIMBOLOS, montarExtratoDaPlanilha, soNaoEnriquecidos, type LinhaExtratoPlanilha, type SeloSistema,
} from '@/v2/lib/mesa/extratoDaPlanilha';

/** O colgroup — a régua da Conferência (pior texto renderizado + 8 + padding), medida no navegador. */
export const COLUNAS_EXTRATO_PLANILHA: ReadonlyArray<{ chave: string; largura: string | null }> = [
  { chave: 'p-data', largura: '44px' },
  { chave: 'p-texto', largura: null },
  { chave: 'p-valor', largura: '84px' },
  { chave: 'simbolo', largura: '26px' },
  { chave: 's-valor', largura: '84px' },
  { chave: 's-data', largura: '44px' },
  { chave: 's-descricao', largura: null },
  { chave: 's-fornecedor', largura: '124px' },
  { chave: 's-origem', largura: '22px' },
  { chave: 's-selo', largura: '84px' },
  { chave: 'acoes', largura: '22px' },
];
export const ALTURA_LINHA_EXTRATO = '18px';

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataCurta = (s: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  return m ? `${m[3]}/${m[2]}` : '—';
};
const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
/* ⚠ CORTADO NA BORDA, SEM "…", COM O TEXTO INTEIRO NO `title` — a exceção que o Gabriel declarou para o "Criar
   lançamentos" (PR-CONC-CRIAR-LOTE-LAYOUT-01), a mesma régua: uma linha por registro, e a reticência é proibida. */
const CEL = 'px-[5px] overflow-hidden whitespace-nowrap';

const COR_SIMBOLO: Record<string, string> = {
  '✓': 'text-emerald-600', '≈': 'text-amber-600', '≠': 'text-red-600', '○': 'text-slate-400', '!': 'text-red-600',
  '↳': 'text-violet-600',
};
const COR_SELO: Record<SeloSistema, string> = {
  'Enriquecido': 'border-emerald-300 bg-emerald-50 text-emerald-800',
  'Cru · aplicar': 'border-amber-300 bg-amber-50 text-amber-800',
  'Diverge': 'border-red-300 bg-red-50 text-red-700',
  'Valor ≠': 'border-red-300 bg-red-50 text-red-700',
  'Só no sistema': 'border-slate-300 bg-slate-50 text-slate-700',
  'Desmembrar': 'border-violet-300 bg-violet-50 text-violet-800',
  'Transferência': 'border-sky-300 bg-sky-50 text-sky-800',
};

export interface ExtratoDaPlanilhaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string | null;
  anoMes: string;
  mesRotulo: string;
  /** As linhas da SESSÃO (todas as contas); o modal recorta pela conta escolhida. */
  staging: readonly ClassificacaoStagingPreviewRow[];
  /** As contas da sessão, na ordem do painel. */
  contas: ReadonlyArray<{ id: string; nome: string }>;
  contaId: string | null;
  onContaId: (id: string) => void;
  sobrescreverIds?: ReadonlySet<string>;
  /** Abre a Mesa nesta linha da planilha (por cima deste modal). */
  onAbrirLinha: (stagingId: string, contaId: string) => void;
}

export function ExtratoDaPlanilhaModal({
  open, onOpenChange, clienteId, anoMes, mesRotulo, staging, contas, contaId, onContaId, sobrescreverIds, onAbrirLinha,
}: ExtratoDaPlanilhaModalProps) {
  const [soPendentes, setSoPendentes] = useState(false);
  const conta = contaId ?? contas[0]?.id ?? null;
  const contaReal = conta && conta !== '__sem__' ? conta : null;
  const { data: espelho, isLoading } = useEspelhadosReais(open ? clienteId : null, contaReal, anoMes);
  const internas = useEspelhoInternas(open ? clienteId : null, contaReal, anoMes);
  const internos = internas.lancamentosInternos;

  const daConta = useMemo(
    () => (conta ? staging.filter((r) => contaDaLinhaStaging(r).id === conta) : []),
    [staging, conta]);
  const extrato = useMemo(
    () => (espelho && contaReal ? montarExtratoDaPlanilha(daConta, espelho, contaReal, internos, sobrescreverIds) : null),
    [espelho, contaReal, daConta, internos, sobrescreverIds]);
  const dias = useMemo(
    () => (extrato ? (soPendentes ? soNaoEnriquecidos(extrato.dias) : extrato.dias) : []),
    [extrato, soPendentes]);
  const nomeConta = contas.find((c) => c.id === conta)?.nome ?? '—';

  const abrir = (l: LinhaExtratoPlanilha) => { if (l.stagingId && conta) onAbrirLinha(l.stagingId, conta); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="h-9 shrink-0 flex-row items-center gap-2.5 space-y-0 bg-primary px-4">
          <DialogTitle className="whitespace-nowrap text-[12px] font-medium text-primary-foreground">
            Extrato da planilha · {nomeConta} · {mesRotulo}
          </DialogTitle>
          <span className="whitespace-nowrap text-[10px] text-primary-foreground/85">Planilha × Sistema</span>
        </DialogHeader>

        {/* ═══ TOPO FIXO: conta, totais, legenda, chave ══════════════════════ */}
        <div className="flex shrink-0 flex-col gap-1 border-b px-3.5 py-1.5">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {contas.filter((c) => c.id !== '__sem__').length > 1 && (
              <Segmentado<string> valor={conta ?? ''} onEscolher={onContaId} altura={22}
                opcoes={contas.filter((c) => c.id !== '__sem__').map((c) => ({ valor: c.id, rotulo: c.nome, title: c.nome }))} />
            )}
          </div>
          {extrato ? (
            <div data-testid="totais-extrato-planilha" className="flex flex-nowrap items-center gap-5 whitespace-nowrap text-[10px] tabular-nums">
              <div className="flex gap-2">
                <span className="text-muted-foreground">Entradas</span>
                <span className="text-blue-700">planilha {brl(extrato.totais.entradasBanco)}</span>
                <span>sistema {brl(extrato.totais.entradasSistema)}</span>
                <span className={Math.abs(extrato.totais.difEntradas) < 0.005 ? 'text-emerald-700' : 'text-red-600'}>
                  {Math.abs(extrato.totais.difEntradas) < 0.005 ? 'confere' : `difere ${brl(extrato.totais.difEntradas)}`}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">Saídas</span>
                <span className="text-blue-700">planilha {brl(extrato.totais.saidasBanco)}</span>
                <span>sistema {brl(extrato.totais.saidasSistema)}</span>
                <span className={Math.abs(extrato.totais.difSaidas) < 0.005 ? 'text-emerald-700' : 'text-red-600'}>
                  {Math.abs(extrato.totais.difSaidas) < 0.005 ? 'confere' : `difere ${brl(extrato.totais.difSaidas)}`}
                </span>
              </div>
              <div className="ml-auto text-right text-muted-foreground">
                {extrato.nPlanilha} linhas da planilha · {extrato.nSistema} lançamentos do sistema
              </div>
            </div>
          ) : (
            <div className="h-[15px] text-[10px] text-muted-foreground">
              {!contaReal ? 'Linhas sem conta não têm lado Sistema para conferir.' : isLoading ? 'Carregando o sistema…' : '—'}
            </div>
          )}
          <div className="flex items-center gap-3 text-[9.5px] text-muted-foreground">
            <span data-testid="legenda" className="flex flex-nowrap gap-2.5 overflow-hidden whitespace-nowrap">
              {LEGENDA_SIMBOLOS.map(([s, t]) => (
                <span key={s}><b className={COR_SIMBOLO[s]}>{s}</b> {t}</span>
              ))}
              <span>· origem: <b>B</b> banco · <b>✓</b> conciliado · <b>M</b> manual</span>
            </span>
            <label className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
              <input type="checkbox" data-testid="so-nao-enriquecidos" checked={soPendentes}
                onChange={(e) => setSoPendentes(e.target.checked)} />
              Só não enriquecidos
            </label>
          </div>
        </div>

        {/* ═══ O CORPO — o único scrollport ═══════════════════════════════════ */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
          <table data-testid="tabela-extrato-planilha" className="w-full table-fixed border-collapse text-[10px] tabular-nums">
            <colgroup>
              {COLUNAS_EXTRATO_PLANILHA.map((c) => (
                <col key={c.chave} style={c.largura ? { width: c.largura } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ height: ALTURA_LINHA_EXTRATO }} className="text-[9.5px]">
                <th colSpan={3} data-testid="cabecalho-planilha" className="sticky top-0 z-[3] bg-blue-100 px-[5px] text-center font-medium text-blue-900">Planilha · referência</th>
                <th className="sticky top-0 z-[3] border-x border-primary-foreground/30 bg-primary text-center font-medium text-primary-foreground" />
                <th colSpan={7} data-testid="cabecalho-sistema" className="sticky top-0 z-[3] bg-primary px-[5px] text-center font-medium text-primary-foreground">Sistema · o que vale</th>
              </tr>
            </thead>
            <tbody>
              {dias.length === 0 && (
                <tr style={{ height: ALTURA_LINHA_EXTRATO }}>
                  <td colSpan={11} className="py-6 text-center text-muted-foreground">
                    {extrato ? 'Nada neste recorte.' : '—'}
                  </td>
                </tr>
              )}
              {dias.map((d) => (
                <DiaRows key={d.data ?? 'sem-data'} d={d} onAbrir={abrir} />
              ))}
            </tbody>
          </table>
        </div>

        {/* ═══ O FECHAMENTO DO MÊS — congelado, fora do scrollport, sempre presente (PR-CONC-ENRIQUECER-V2-02) ═══
            ⚠ NENHUM CÁLCULO NOVO: são os totais do topo (`totaisDoEspelho`), somados — as saídas já vêm negativas. */}
        <FechamentoDoMes mesRotulo={mesRotulo} totais={extrato?.totais ?? null} />
      </DialogContent>
    </Dialog>
  );
}

/** A faixa de 22px do fechamento do mês: "planilha P · sistema S · confere | difere R$ P−S"; sem extrato, "—". */
export function FechamentoDoMes({ mesRotulo, totais }: {
  mesRotulo: string;
  totais: { entradasBanco: number; saidasBanco: number; entradasSistema: number; saidasSistema: number } | null;
}) {
  const p = totais ? totais.entradasBanco + totais.saidasBanco : null;
  const sis = totais ? totais.entradasSistema + totais.saidasSistema : null;
  const dif = p !== null && sis !== null ? p - sis : null;
  return (
    <div data-testid="fechamento-mes"
      className="flex h-[22px] shrink-0 items-center overflow-hidden whitespace-pre bg-primary px-3.5 text-[10px] tabular-nums text-primary-foreground">
      <span className="font-semibold">Fechamento {mesRotulo}</span>
      {p === null || sis === null || dif === null ? (
        <span>{' · —'}</span>
      ) : (
        <>
          <span>{` · planilha ${brl(p)}`}</span>
          <span>{` · sistema ${brl(sis)}`}</span>
          <span className="font-semibold">{` · ${Math.abs(dif) < 0.005 ? 'confere' : `difere R$ ${brl(dif)}`}`}</span>
        </>
      )}
    </div>
  );
}

function DiaRows({ d, onAbrir }: { d: ReturnType<typeof soNaoEnriquecidos>[number]; onAbrir: (l: LinhaExtratoPlanilha) => void }) {
  const dif = d.planilha - d.sistema;
  return (
    <>
      {d.linhas.map((l) => (
        <tr key={l.chave} data-testid="linha-extrato-planilha" data-staging={l.stagingId ?? undefined}
          style={{ height: ALTURA_LINHA_EXTRATO }}
          onClick={() => onAbrir(l)}
          className={`border-b border-border/40 ${l.stagingId ? 'cursor-pointer hover:bg-primary/[0.04]' : ''} ${
            l.enriquecida ? 'bg-success/[0.06]' : ''}`}>
          <td className={`${CEL} text-[9.5px] text-muted-foreground`}>{l.planilha ? dataCurta(l.data) : ''}</td>
          <td className={`${CEL} ${l.filha ? 'pl-[14px]' : ''}`} title={l.planilha?.texto}>{l.planilha?.texto ?? ''}</td>
          <td className={`${CEL} text-right ${l.planilha ? corVal(l.planilha.valor) : ''}`}>{l.planilha ? brl(l.planilha.valor) : ''}</td>
          <td data-testid="simbolo" className={`border-x text-center font-bold ${l.simbolo ? COR_SIMBOLO[l.simbolo] : ''}`}>{l.simbolo ?? ''}</td>
          <td className={`${CEL} text-right ${l.sistema ? corVal(l.sistema.valor) : ''}`}>{l.sistema ? brl(l.sistema.valor) : ''}</td>
          <td className={`${CEL} text-[9.5px] text-muted-foreground`}>{l.sistema ? dataCurta(l.sistema.data) : ''}</td>
          <td className={CEL} title={l.sistema?.descricao}>{l.sistema?.descricao ?? ''}</td>
          <td className={`${CEL} text-muted-foreground`} title={l.sistema?.fornecedor}>{l.sistema?.fornecedor ?? ''}</td>
          <td className="text-center text-[9.5px] font-semibold text-muted-foreground" data-testid="origem">{l.sistema?.origem ?? ''}</td>
          <td className="px-[3px] text-center">
            {l.selo && (
              <span data-testid="selo" className={`inline-flex h-[13px] items-center whitespace-nowrap rounded-[3px] border px-[4px] text-[9.5px] leading-none ${COR_SELO[l.selo]}`}>
                {l.selo}
              </span>
            )}
          </td>
          <td className="text-center">
            {l.stagingId && (
              <button type="button" aria-label="Abrir na Mesa" data-testid="abrir-mesa"
                onClick={(e) => { e.stopPropagation(); onAbrir(l); }}
                className="rounded px-1 text-muted-foreground hover:bg-muted">⋯</button>
            )}
          </td>
        </tr>
      ))}
      {/* ⚠ O DIA FECHA NO FIM, COMO NA CONFERÊNCIA (PR-CONC-ENRIQUECER-V2-02): "fechamento DD/MM", o par de tokens de lá.
          No fechamento o azul vence o verde/vermelho — a linha é subtotal, o sinal já está no número. */}
      <tr data-testid="dia" style={{ height: ALTURA_LINHA_EXTRATO }} className="border-b border-t border-border bg-primary/10 text-[9.5px]">
        <td colSpan={2} className={`${CEL} font-semibold text-primary`}>fechamento {dataCurta(d.data)}</td>
        <td className={`${CEL} text-right font-semibold text-primary`}>{brl(d.planilha)}</td>
        <td />
        <td className={`${CEL} text-right font-semibold text-primary`}>{brl(d.sistema)}</td>
        <td colSpan={6} className={`${CEL} text-right font-semibold`} data-testid="fecho-dia">
          {d.confere ? <span className="text-emerald-700">confere</span> : <span className="text-red-600">difere R$ {brl(dif)}</span>}
        </td>
      </tr>
    </>
  );
}

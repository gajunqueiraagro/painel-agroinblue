/**
 * FOLHA-01 · PR B (telas) — a aba HISTÓRICO: TODOS os pagamentos ligados a uma pessoa (inclusive os pagos ao contador ou à Caixa), com os
 * documentos. Contrato §3.2 + §6.
 * ⚠ O TIPO VEM DO BANCO (regra única: 13º · Rescisão · Multa rescisória · Férias · Adiantamento · Benefício · Salário · Outro); a tela só
 *   filtra (`TIPOS_DO_FILTRO`). "Pago a" em destaque quando é outro favorecido (`pago_a_outro`).
 * ⚠ O PERÍODO é o `SeletorPeriodo` da casa (meses, com intervalo) + "Todo o período" (o padrão: a pessoa inteira). Filtra pela data do
 *   pagamento (sem ela, vencimento ou competência) — no banco.
 * ⚠ A FAIXA É FIXA: o seletor de pessoa 280px, o tipo num Segmentado de 6 × 84px, o resumo da pessoa no resto ("…" + `title`); a 2ª linha
 *   é a do período. A TABELA é a régua da casa, `colgroup` do §6.
 */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM, QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { SeletorPeriodo } from '@/v2/components/SeletorPeriodo';
import { anoInteiro, intervaloDoPeriodo, type Periodo } from '@/v2/lib/periodo';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { useFuncionarios, useHistorico } from '@/hooks/useFolha';
import { cn } from '@/lib/utils';
import {
  competenciaBR, contagemDoFiltroTipo, dataBR, doFiltroTipo, n2, rotuloSituacao, rotuloStatus,
  type FiltroTipo, type ItemDoHistorico,
} from '@/lib/folha/folhaTela';
import { LancamentoDaFolha } from './LancamentoDaFolha';
import { useVerDocumento } from './useVerDocumento';

type Coluna = 'competencia' | 'pagamento' | 'tipo' | 'descricao' | 'pago_a' | 'valor' | 'status' | 'documentos' | 'abrir';
const COLUNAS: ReadonlyArray<{ coluna: Coluna; rotulo: string; largura: number | null; direita?: boolean; ordena?: boolean }> = [
  { coluna: 'competencia', rotulo: 'Competência', largura: 80, ordena: true },
  { coluna: 'pagamento', rotulo: 'Pagamento', largura: 76, ordena: true },
  { coluna: 'tipo', rotulo: 'Tipo', largura: 112, ordena: true },
  { coluna: 'descricao', rotulo: 'Descrição', largura: null, ordena: true },
  { coluna: 'pago_a', rotulo: 'Pago a (favorecido)', largura: 190, ordena: true },
  { coluna: 'valor', rotulo: 'Valor', largura: 90, direita: true, ordena: true },
  { coluna: 'status', rotulo: 'Status', largura: 84, ordena: true },
  { coluna: 'documentos', rotulo: 'Documentos', largura: 150, ordena: true },
  { coluna: 'abrir', rotulo: '', largura: 52 },
];
const ORDENAVEIS: readonly ColunaOrdenavel<ItemDoHistorico, Coluna>[] = [
  { coluna: 'competencia', tipo: 'texto', valor: i => i.competencia },
  { coluna: 'pagamento', tipo: 'data', valor: i => i.data_pagamento ?? i.data },
  { coluna: 'tipo', tipo: 'texto', valor: i => i.tipo },
  { coluna: 'descricao', tipo: 'texto', valor: i => i.descricao },
  { coluna: 'pago_a', tipo: 'texto', valor: i => i.favorecido },
  { coluna: 'valor', tipo: 'numero', valor: i => i.valor },
  { coluna: 'status', tipo: 'texto', valor: i => rotuloStatus(i.status, i.conciliado) },
  { coluna: 'documentos', tipo: 'numero', valor: i => i.documentos.length || null },
];
const FILTROS: ReadonlyArray<{ valor: FiltroTipo; rotulo: string }> = [
  { valor: 'tudo', rotulo: 'Tudo' }, { valor: 'salario', rotulo: 'Salário' }, { valor: '13', rotulo: '13º' },
  { valor: 'ferias', rotulo: 'Férias' }, { valor: 'rescisao', rotulo: 'Rescisão' }, { valor: 'beneficios', rotulo: 'Benefícios' },
];
function Colunas() {
  return <colgroup>{COLUNAS.map(c => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>;
}

export function AbaHistorico({ clienteId, funcionarioId, onEscolher, onFicha }: {
  clienteId: string; funcionarioId: string | null; onEscolher: (id: string | null) => void; onFicha: (id: string) => void;
}) {
  const { data: lista } = useFuncionarios(clienteId);
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [filtro, setFiltro] = useState<FiltroTipo>('tudo');
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const { ver, visualizador } = useVerDocumento(setErro);
  const intervalo = periodo ? intervaloDoPeriodo(periodo) : null;
  const { data: hist, isLoading, error } = useHistorico(funcionarioId, intervalo?.de ?? null, intervalo?.ate ?? null);

  const itens = useMemo(() => (hist?.itens ?? []).filter(i => doFiltroTipo(i.tipo, filtro)), [hist, filtro]);
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela(itens, ORDENAVEIS, { coluna: 'pagamento', direcao: 'desc' });
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const aOutro = itens.filter(i => i.pago_a_outro).length;
  const pessoa = hist?.funcionario ?? null;
  const linha = lista?.funcionarios.find(f => f.id === funcionarioId) ?? null;
  /* o resumo à vista é CURTO (situação · admissão), em até duas linhas reservadas, a data sempre inteira: a 1126 sobram ~85px entre a
     pessoa e o período (gate 24/11). A atuação vai só no `title` (e está na ficha). */
  const atuacaoDoResumo = linha?.atuacao[0] ? [linha.atuacao[0].fazenda, linha.atuacao[0].atividade].filter(Boolean).join(' · ') : '';
  const resumo = pessoa
    ? [rotuloSituacao(pessoa), pessoa.admissao ? `admitido ${dataBR(pessoa.admissao)}` : 'admissão a confirmar', atuacaoDoResumo].filter(Boolean).join(' · ')
    : '';
  const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary transition-[filter] hover:brightness-110');
  const opcoesPessoa = (lista?.funcionarios ?? []).map(f => ({ value: f.id, label: f.situacao === 'desligado' ? `${f.nome} (desligado)` : f.nome }));
  const anoAtual = new Date().getFullYear();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border bg-card px-2 py-1.5" data-testid="folha-historico-faixa">
        {/* Quando não cabe (até 1000px), a linha quebra — pela largura, nunca pelo estado (o seletor e as 6 opções têm largura fixa) */}
        <div className="flex min-h-[24px] flex-wrap items-center gap-x-2 gap-y-1">
          <div className="w-[280px] shrink-0">
            <SearchableSelect value={funcionarioId ?? ''} onValueChange={v => onEscolher(v || null)} semTodos allLabel="escolha o funcionário" allValue=""
              options={opcoesPessoa} triggerClassName="h-[24px] text-[11px]" />
          </div>
          <Segmentado altura={22} fonte={10} valor={filtro} onEscolher={setFiltro} opcoes={FILTROS.map(f => ({
            valor: f.valor,
            rotulo: <span className="inline-flex w-[74px] items-center justify-center gap-1">{f.rotulo}
              <TextoReservado texto={hist ? String(contagemDoFiltroTipo(hist.por_tipo, f.valor)) : ''} reserva="999" className="text-[9.5px] opacity-80" /></span>,
          }))} />
          <span className="max-h-[22px] min-w-[160px] flex-1 overflow-hidden whitespace-normal text-[9.5px] leading-[11px] text-muted-foreground"
            title={resumo || undefined} data-testid="folha-historico-resumo">
            {pessoa && <>{rotuloSituacao(pessoa)} · {pessoa.admissao
              ? <>admitido <span className="whitespace-nowrap">{dataBR(pessoa.admissao)}</span></> : 'admissão a confirmar'}</>}
          </span>
          {funcionarioId && (
            <button type="button" className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium text-primary hover:underline"
              onClick={() => onFicha(funcionarioId)}>ficha <ExternalLink className="h-3 w-3" /></button>
          )}
        </div>
        {/* O SeletorPeriodo ano-mês tem DUAS linhas (a barra de 30px + 4px + a linha do chip de 18px, reservada sempre) = 52px: com 30px e
            items-center ele saía 11px para cima, sobre o resumo (gate 1126×579, "Personalizado…" sobre "Ativo · admitido …"). */}
        <div className="flex h-[52px] items-start gap-2">
          <div className={cn('min-w-0 flex-1', !periodo && 'opacity-60')} title={periodo ? undefined : 'mostrando todo o período — clique num mês ou ano para recortar'}>
            <SeletorPeriodo modo="ano-mes" periodo={periodo ?? anoInteiro(anoAtual)} onPeriodoChange={setPeriodo} />
          </div>
          <button type="button" onClick={() => setPeriodo(null)} data-testid="folha-historico-todo"
            className={cn('inline-flex h-[24px] w-[110px] shrink-0 items-center justify-center rounded-md border text-[10.5px] font-medium',
              periodo ? 'text-muted-foreground hover:bg-muted' : 'border-primary bg-primary text-primary-foreground')}>Todo o período</button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className={QUADRO_REGUA}>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll" data-testid="folha-historico-rolagem">
            <table className="w-full table-fixed border-collapse" data-testid="folha-historico-tabela">
              <Colunas />
              <thead className="text-primary-foreground">
                <tr className="h-[22px]">
                  {COLUNAS.map(c => c.ordena
                    ? <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.rotulo} ordem={ordem} onOrdenar={alternar} alinhaDireita={c.direita} className={TH} />
                    : <th key={c.coluna} className={TH} />)}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(i => (
                  <tr key={i.lancamento_id} className="h-[19px] border-b border-border/40 hover:bg-muted/40" data-testid="folha-historico-linha">
                    <td className={cn(TD_REGUA_NUM, 'text-left')}>{competenciaBR(i.competencia)}</td>
                    <td className={cn(TD_REGUA_NUM, 'text-left')} title={i.data_pagamento ? undefined : 'sem data de pagamento: o vencimento'}>{dataBR(i.data_pagamento ?? i.data)}</td>
                    <td className={TD_REGUA_TEXTO} title={i.tipo}>{i.tipo}</td>
                    <td className={TD_REGUA_TEXTO} title={i.descricao ?? undefined}>{i.descricao ?? '—'}</td>
                    <td className={cn(TD_REGUA_TEXTO, i.pago_a_outro && 'font-semibold text-amber-800')} title={i.pago_a_outro ? `${i.favorecido ?? ''} — pago a outro favorecido` : i.favorecido ?? undefined}
                      data-testid="folha-historico-pago-a">{i.favorecido ?? '—'}</td>
                    <td className={TD_REGUA_NUM}>{n2(i.valor)}</td>
                    <td className={cn(TD_REGUA, 'whitespace-nowrap', i.conciliado && 'text-emerald-700')}>{rotuloStatus(i.status, i.conciliado)}</td>
                    <td className={cn(TD_REGUA, 'overflow-hidden whitespace-nowrap')} title={i.documentos.map(d => d.nome).join(' · ') || undefined}>
                      {i.documentos.length === 0 ? <span className="text-muted-foreground">—</span> : (
                        <span className="inline-flex items-center gap-[3px]">
                          {i.documentos.slice(0, 2).map(d => (
                            <button key={`${d.origem}:${d.id}`} type="button" className="max-w-[60px] truncate rounded bg-sky-50 px-1 text-[9.5px] leading-[14px] text-sky-800 hover:underline"
                              title={d.nome} onClick={() => void ver(d.bucket, d.storage_path, d.nome)}>{d.nome}</button>
                          ))}
                          {i.documentos.length > 2 && <span className="text-[9.5px] font-semibold text-sky-800">+{i.documentos.length - 2}</span>}
                        </span>
                      )}
                    </td>
                    <td className={cn(TD_REGUA, 'text-center')}>
                      <button type="button" className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline" onClick={() => setAbrindo(i.lancamento_id)}
                        data-testid="folha-historico-abrir">abrir <ExternalLink className="h-3 w-3" /></button>
                    </td>
                  </tr>
                ))}
                {ordenadas.length === 0 && (
                  <tr className="h-[19px]">
                    <td colSpan={COLUNAS.length} className={cn(TD_REGUA, 'py-6 text-center text-muted-foreground')}>
                      {!funcionarioId ? 'Escolha um funcionário.' : isLoading ? 'Carregando…' : error ? 'Não consegui ler o histórico. Tente de novo.'
                        : (hist?.itens.length ?? 0) === 0 ? 'Nenhum pagamento ligado a esta pessoa no período.' : 'Nenhum pagamento deste tipo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={cn(RODAPE_REGUA, 'overflow-x-hidden overflow-y-scroll')} data-testid="folha-historico-rodape">
            <table className="w-full table-fixed border-collapse">
              <Colunas />
              <tbody>
                <tr className="h-[22px] font-semibold">
                  <td colSpan={5} className="truncate px-1" title={erro ?? undefined}>
                    {erro ? <span className="text-red-200">{erro}</span>
                      : `${itens.length.toLocaleString('pt-BR')} ${itens.length === 1 ? 'pagamento' : 'pagamentos'} ligados${aOutro ? ` · ${aOutro.toLocaleString('pt-BR')} pagos a outro favorecido (contador, Caixa)` : ''}`}
                  </td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums">{n2(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {visualizador}
      {abrindo && <LancamentoDaFolha lancamentoId={abrindo} aoFechar={() => setAbrindo(null)} onAbrirFuncionario={id => { setAbrindo(null); onEscolher(id); }} />}
    </div>
  );
}

/**
 * FIN-VISAO-GERAL-01 PR 3 — os filtros da Visão Geral que moram na barra azul do shell (SPEC §3.1 + seção 9 do AGRO): Contas
 * (todas / várias / "só esta"), Fazenda e Atividade (P83: a Safra saiu), um ao lado do outro, cada um com LARGURA FIXA (trocar a escolha não empurra
 * nada — o gate `check:ui-desloca`). O estado é o `filtrosVG` (lib), que a tela lê.
 *   · Contas: o padrão é o conjunto do banco (`no_caixa` — cc, investimento/permuta e, desde o P82, os cartões: a compra no cartão é
 *     saída, o pagamento da fatura é transferência dentro do conjunto). O botão fica
 *     âmbar quando a escolha não é o padrão.
 *   · Atividade: a lista é a que o cliente USA (escopo dos lançamentos, do banco) — nada fixo aqui.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { AcoesDaListaMultipla } from '@/components/ui/acoes-lista-multipla';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import { filtrosVG, rotuloAtividade, useFiltrosVG, type ContaVG, type FiltrosVG } from '@/lib/financeiro/visaoGeral';

const emAndamento = new Set<string>();
/** a lista dos filtros (contas, atividades, safras) do cliente — uma vez por cliente, para a barra e a tela */
export function useCarregarFiltrosVG() {
  const { clienteAtual } = useCliente();
  const id = clienteAtual?.id ?? null;
  const e = useFiltrosVG();
  useEffect(() => {
    if (!id || (e.clienteId === id && e.lista) || emAndamento.has(id)) return;
    emAndamento.add(id);
    filtrosVG.mudar({ clienteId: id, lista: null, contas: null, fazenda: null, safra: null, atividade: null });
    (supabase.rpc as any)('fn_vg_filtros', { p_cliente: id }).then(({ data }: { data: FiltrosVG | null }) => {
      emAndamento.delete(id);
      if (filtrosVG.ler().clienteId === id) filtrosVG.mudar({ lista: data ?? { contas: [], atividades: [], safras: [] } });
    });
  }, [id, e.clienteId, e.lista]);
  return e;
}

function BotaoBarra({ rotulo, rotuloCurto, title, largura, destacado, testid, children }: {
  rotulo: string; rotuloCurto: string; title: string; largura: string; destacado?: boolean; testid: string; children: ReactNode | ((fechar: () => void) => ReactNode);
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testid} title={title}
          className={cn('flex h-5 shrink-0 items-center justify-between gap-1 rounded border px-2 text-[10px] text-white', largura,
            destacado ? 'border-[#f2b84b]' : 'border-[#4a6a92]')}
          style={{ background: '#2b4c75' }}>
          {/* abaixo de 1024px a barra aperta: o rótulo curto (o inteiro fica no title) — nada corta */}
          <span className="hidden min-w-0 whitespace-nowrap lg:inline">{rotulo}</span>
          <span className="min-w-0 whitespace-nowrap lg:hidden">{rotuloCurto}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-80" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-2 text-[10px]" onClick={(ev) => ev.stopPropagation()}>
        {typeof children === 'function' ? children(() => setAberto(false)) : children}
      </PopoverContent>
    </Popover>
  );
}

const Opcao = ({ marcada, onClick, children, testid }: { marcada: boolean; onClick: () => void; children: ReactNode; testid?: string }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    className={cn('flex h-5 w-full items-center rounded px-1.5 text-left text-[10px] hover:bg-muted', marcada && 'bg-[#e8eef7] font-semibold')}>
    <span className="min-w-0 truncate">{children}</span>
  </button>
);

const TODAS = '__todas__';
const GATILHO_ESCURO = 'h-5 w-full rounded border bg-[#2b4c75] px-2 text-[10px] text-white';

const TIPO_DA_CONTA: Record<string, string> = { cc: 'CONTA CORRENTE', inv: 'INVESTIMENTO', permuta: 'PERMUTA', cartao: 'CARTÃO DE CRÉDITO' };

export function rotuloDasContas(contas: ContaVG[], escolha: string[] | null): string {
  const sel = escolha ?? contas.filter((c) => c.no_caixa).map((c) => c.id);
  if (escolha === null) return 'Caixa + cartões';
  if (sel.length === 0) return 'Nenhuma conta';
  if (sel.length === 1) return contas.find((c) => c.id === sel[0])?.nome ?? '1 conta';
  return `${sel.length} contas`;
}

export function FiltrosBarraVG() {
  const e = useCarregarFiltrosVG();
  const { fazendas } = useFazenda();
  const contas = e.lista?.contas ?? [];
  const padrao = useMemo(() => contas.filter((c) => c.no_caixa).map((c) => c.id), [contas]);
  const marcadas = new Set(e.contas ?? padrao);
  const ativas = contas.filter((c) => c.ativa);
  const alternar = (id: string) => {
    const nova = new Set(marcadas);
    if (nova.has(id)) nova.delete(id); else nova.add(id);
    const lista = ativas.map((c) => c.id).filter((x) => nova.has(x));
    const ehPadrao = lista.length === padrao.length && lista.every((x) => padrao.includes(x));
    filtrosVG.mudar({ contas: ehPadrao ? null : lista });
  };
  const rotContas = rotuloDasContas(contas, e.contas);
  const curtoContas = e.contas === null ? 'Contas' : e.contas.length === 0 ? 'Nenhuma' : e.contas.length === 1 ? '1 conta' : `${e.contas.length} contas`;
  const fazendaNome = fazendas.find((f: { id: string }) => f.id === e.fazenda)?.nome;
  let ultimoTipo = '';
  return (
    <span className="hidden items-center gap-1.5 md:flex" data-testid="filtros-barra-vg">
      <BotaoBarra testid="vg-contas" largura="w-[78px] lg:w-[124px]" rotulo={rotContas} rotuloCurto={curtoContas} title={`Contas: ${rotContas}`} destacado={e.contas !== null}>
        {/* P83 — "Todas · Limpar" no topo (o par da casa para seleção múltipla): Todas = todas as ativas; Limpar = nenhuma, para marcar à mão */}
        <AcoesDaListaMultipla testid="vg-contas-acoes" todasMarcadas={ativas.every((c) => marcadas.has(c.id))} nenhumaMarcada={marcadas.size === 0}
          onTodas={() => filtrosVG.mudar({ contas: ativas.map((c) => c.id) })} onLimpar={() => filtrosVG.mudar({ contas: [] })} />
        <Opcao marcada={e.contas === null} onClick={() => filtrosVG.mudar({ contas: null })} testid="vg-contas-padrao">
          Caixa + cartões (a fatura do cartão é transferência)
        </Opcao>
        <div className="max-h-[260px] overflow-y-auto">
          {ativas.map((c) => {
            const cab = c.tipo !== ultimoTipo ? (TIPO_DA_CONTA[c.tipo] ?? (c.tipo || 'OUTRAS').toUpperCase()) : null;
            ultimoTipo = c.tipo;
            return (
              <div key={c.id}>
                {cab && <div className="px-1.5 pb-px pt-1 text-[8.5px] font-semibold tracking-wide text-muted-foreground">{cab}</div>}
                <div className="group grid h-5 grid-cols-[16px_minmax(0,1fr)_44px] items-center gap-1 px-1.5">
                  <Checkbox aria-label={c.nome} checked={marcadas.has(c.id)} onCheckedChange={() => alternar(c.id)} className="h-3 w-3" />
                  <span className="truncate" title={c.nome}>{c.nome}</span>
                  <button type="button" className="invisible text-right text-[9px] text-[#1f5fa8] group-hover:visible"
                    onClick={() => filtrosVG.mudar({ contas: [c.id] })}>só esta</button>
                </div>
              </div>
            );
          })}
        </div>
      </BotaoBarra>
      {/* Fazenda: o seletor DA CASA com busca (`SearchableSelect`, regra do check:ui-nativo), com "Todas" no topo */}
      <span className="w-[92px] shrink-0 lg:w-[120px]" title={`Fazenda: ${fazendaNome ?? 'todas'}`} data-testid="vg-fazenda">
        <SearchableSelect value={e.fazenda ?? TODAS} onValueChange={(v) => filtrosVG.mudar({ fazenda: v === TODAS ? null : v })}
          allValue={TODAS} allLabel="Fazendas" dense
          options={fazendas.filter((f: { id: string }) => f.id !== '__global__').map((f: { id: string; nome: string }) => ({ value: f.id, label: f.nome }))}
          triggerClassName={cn(GATILHO_ESCURO, e.fazenda !== null ? 'border-[#f2b84b]' : 'border-[#4a6a92]')} />
      </span>
      {/* P83 — a Safra saiu da Visão Geral: caixa por safra fica no Painel da Safra / DRE (saldo existe só por conta) */}
      <BotaoBarra testid="vg-atividade" largura="w-[84px] lg:w-[116px]" rotulo={e.atividade ? rotuloAtividade(e.atividade) : 'Atividade: todas'} rotuloCurto={e.atividade ? '1 atividade' : 'Atividades'}
        title={`Atividade: ${e.atividade ? rotuloAtividade(e.atividade) : 'todas'}`} destacado={e.atividade !== null}>
        {(fechar) => (
          <>
            <Opcao marcada={e.atividade === null} onClick={() => { filtrosVG.mudar({ atividade: null }); fechar(); }} testid="vg-atividade-todas">Todas as atividades</Opcao>
            {(e.lista?.atividades ?? []).map((a) => (
              <Opcao key={a} marcada={e.atividade === a} onClick={() => { filtrosVG.mudar({ atividade: a }); fechar(); }} testid={`vg-atividade-${a}`}>{rotuloAtividade(a)}</Opcao>
            ))}
          </>
        )}
      </BotaoBarra>
    </span>
  );
}

/**
 * PainelPeriodoTab — a leitura do Extrato Gerencial, com o recorte que o fechamento usa.
 * FIN-PAINEL-SAFRA-01.
 *
 * ⚠ NENHUM COMPONENTE NOVO DE ANÁLISE, NENHUMA SEGUNDA AGREGAÇÃO. A Distribuição econômica e
 * os Principais custos são os MESMOS de `ExtratoGerencialTab`, e as contas são as de
 * `analiseAgregacoes`. O que muda é só o conjunto de itens que chega: lá é uma conta num mês,
 * aqui é o recorte declarado na barra. Duas definições da mesma leitura divergiriam, e a tela
 * de conferência passaria a discordar da tela conferida.
 *
 * ⚠ EVOLUÇÃO DO CAIXA E ORGANIZAÇÃO DOS PAGAMENTOS FICARAM DE FORA, por natureza e não por
 * escopo: a primeira é saldo corrido de UMA conta (não existe saldo de "todas"), e a segunda
 * distribui por dia do mês em três etapas — uma safra de doze meses não tem "dia 03".
 *
 * ⚠ O PADRÃO É `realizado`. Medido na safra 25/26 Amendoim do NJ: os 35 lançamentos
 * `programado` somam R$ 9,74 mi de Custeio contra R$ 1,88 mi dos 392 `realizado`, que é o
 * número do fechamento. Somar os dois diria seis vezes mais e pareceria certo.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { ExtratoDistribuicaoEconomica } from '@/components/financeiro-v2/ExtratoDistribuicaoEconomica';
import { ExtratoMaioresCompromissos } from '@/components/financeiro-v2/ExtratoMaioresCompromissos';
import { ExtratoOrganizacaoPagamentos } from '@/components/financeiro-v2/ExtratoOrganizacaoPagamentos';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda as useFazendaCtx } from '@/contexts/FazendaContext';
import { formatMoeda } from '@/lib/calculos/formatters';
import { paginarTudo } from '@/lib/financeiro/paginarTudo';
import { isTransferencia } from '@/lib/analise/analiseAgregacoes';
import { ATIVIDADES, type Atividade } from '@/lib/financeiro/ultimaAtividade';
import {
  RECORTE_PADRAO, janelaDoRecorte, impedimentoDoRecorte, descreverPeriodo, descreverEixo,
  type RecortePainel, type ModoPeriodo, type EixoData, type FiltroStatus,
} from '@/lib/financeiro/recortePainel';

/* As colunas que as agregações e o drawer precisam. NÃO é `select('*')`: são 65 colunas na
   tabela e o recorte de um ano do NJ tem 4.148 linhas — trazer o que não se lê é transporte
   puro. O lançamento inteiro é buscado por id quando o operador abre um. */
const COLUNAS = 'id, data_pagamento, data_vencimento, data_competencia, valor, tipo_operacao, '
  + 'descricao, numero_documento, documento, favorecido_id, macro_custo, grupo_custo, '
  + 'centro_custo, subcentro, escopo_negocio, status_transacao, safra_id';

interface LancRecorte {
  id: string; data_pagamento: string | null; data_vencimento: string | null; data_competencia: string | null;
  valor: number; tipo_operacao: string; descricao: string | null;
  numero_documento: string | null; documento: string | null; favorecido_id: string | null;
  macro_custo: string | null; grupo_custo: string | null; centro_custo: string | null;
  subcentro: string | null; escopo_negocio: string | null; status_transacao: string | null;
  safra_id: string | null;
}
interface SafraOpcao { id: string; nome: string; escopo_negocio: string | null; }
interface ContaOpcao { id: string; nome_conta: string; nome_exibicao: string | null; }

const ANOS = (() => { const a: number[] = []; for (let y = 2030; y >= 2019; y--) a.push(y); return a; })();
const MODOS: { k: ModoPeriodo; l: string }[] = [
  { k: 'safra', l: 'Safra' }, { k: 'ano', l: 'Ano' }, { k: 'datas', l: 'Datas' },
];
const EIXOS: { k: EixoData; l: string }[] = [
  { k: 'financeira', l: 'Financeira' }, { k: 'competencia', l: 'Competência' },
];
const STATUS: { k: FiltroStatus; l: string }[] = [
  { k: 'realizado', l: 'Realizado' }, { k: 'todos', l: 'Todos' },
];
const TODAS = '__todas__';

export function PainelPeriodoTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { fazendaAtual } = useFazenda();
  const fazScope = fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;

  const [recorte, setRecorte] = useState<RecortePainel>({ ...RECORTE_PADRAO, ano: new Date().getFullYear() });
  const mexer = (p: Partial<RecortePainel>) => setRecorte((r) => ({ ...r, ...p }));

  /**
   * O MODAL DE EDIÇÃO, e não o de leitura — o painel existe para achar o errado e corrigir.
   *
   * ⚠ A LINHA VEM DO BANCO NA HORA DE ABRIR, não do recorte. O `select` do painel traz 17 das
   * 65 colunas (o que as agregações leem); o modal precisa da linha inteira. Buscar uma
   * linha ao clicar é mais barato que carregar 65 colunas de quatro mil para o caso de o
   * operador abrir uma.
   */
  const fin = useFinanceiroV2();
  const { fazendas } = useFazendaCtx();
  const [editando, setEditando] = useState<LancamentoV2 | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const abrirLancamento = async (id: string) => {
    setAbrindo(true);
    try {
      /* Sem `as`: o idioma `(supabase as any)` já devolve `any`, e anotar o destino é o que
         estreita o tipo — um segundo cast só repetiria o que a anotação diz. */
      const { data } = await (supabase as any).from('financeiro_lancamentos_v2')
        .select('*').eq('id', id).maybeSingle();
      const linha: LancamentoV2 | null = data ?? null;
      if (linha) setEditando(linha);
    } finally {
      setAbrindo(false);
    }
  };

  const { data: contas = [] } = useQuery({
    queryKey: ['painel-periodo-contas', clienteId, fazScope],
    enabled: !!clienteId,
    queryFn: async (): Promise<ContaOpcao[]> => {
      let q = (supabase as any).from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao, ordem_exibicao')
        .eq('cliente_id', clienteId).eq('ativa', true).order('ordem_exibicao');
      if (fazScope) q = q.eq('fazenda_id', fazScope);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: safras = [] } = useQuery({
    queryKey: ['painel-periodo-safras', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<SafraOpcao[]> => {
      const { data } = await (supabase as any).from('financeiro_safras')
        .select('id, nome, escopo_negocio, ordem_exibicao')
        .eq('cliente_id', clienteId).eq('ativa', true)
        .order('ordem_exibicao', { ascending: true }).order('nome', { ascending: true });
      return data ?? [];
    },
  });

  const safraAtual = useMemo(
    () => safras.find((s) => s.id === recorte.safraId) ?? null, [safras, recorte.safraId]);
  const impedimento = impedimentoDoRecorte(recorte);

  const { data: lancs = [], isFetching } = useQuery({
    queryKey: ['painel-periodo-lancs', clienteId, recorte],
    enabled: !!clienteId && !impedimento,
    queryFn: async (): Promise<LancRecorte[]> => paginarTudo<LancRecorte>(async (de, tamanho) => {
      let q = (supabase as any).from('financeiro_lancamentos_v2')
        .select(COLUNAS)
        .eq('cliente_id', clienteId).eq('cancelado', false).neq('cenario', 'meta');
      if (recorte.status === 'realizado') q = q.eq('status_transacao', 'realizado');
      if (recorte.contaId) q = q.or(`conta_bancaria_id.eq.${recorte.contaId},conta_destino_id.eq.${recorte.contaId}`);
      if (recorte.escopo) q = q.eq('escopo_negocio', recorte.escopo);
      if (recorte.modo === 'safra') {
        q = q.eq('safra_id', recorte.safraId);
      } else {
        const j = janelaDoRecorte(recorte);
        if (!j) return { linhas: [], brutas: 0 };
        q = recorte.eixo === 'competencia'
          ? q.gte('data_competencia', j.de).lt('data_competencia', j.ate)
          /* A dimensão "financeira" é COALESCE(pagamento, vencimento) — a mesma do grid e a
             mesma do Extrato Gerencial. Sem o segundo ramo, todo lançamento ainda não pago
             sumiria do recorte. */
          : q.or(`and(data_pagamento.gte.${j.de},data_pagamento.lt.${j.ate}),`
            + `and(data_pagamento.is.null,data_vencimento.gte.${j.de},data_vencimento.lt.${j.ate})`);
      }
      const { data, error } = await q.order('id', { ascending: true }).range(de, de + tamanho - 1);
      if (error) throw error;
      const linhas: LancRecorte[] = data ?? [];
      return { linhas, brutas: linhas.length };
    }),
  });

  const favIds = useMemo(
    () => Array.from(new Set(lancs.map((l) => l.favorecido_id).filter((v): v is string => !!v))).sort(),
    [lancs]);
  const { data: fornMap } = useQuery({
    queryKey: ['painel-periodo-forn', favIds.length, favIds[0] ?? ''],
    enabled: favIds.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      /* Os favorecidos vêm em levas pelo mesmo motivo dos lançamentos: 4 mil linhas podem ter
         mais de mil favorecidos distintos, e o `.in()` também respeita o teto. */
      const nomes = await paginarTudo<{ id: string; nome: string }>(async (de, tamanho) => {
        const fatia = favIds.slice(de, de + tamanho);
        if (fatia.length === 0) return { linhas: [], brutas: 0 };
        const { data } = await (supabase as any).from('financeiro_fornecedores').select('id, nome').in('id', fatia);
        return { linhas: (data ?? []) as { id: string; nome: string }[], brutas: fatia.length };
      });
      return new Map(nomes.map((f) => [f.id, f.nome]));
    },
  });

  /* ⚠ O SINAL VEM DO TIPO, NÃO DA CONTA EM FOCO. No Extrato Gerencial o `mov` é o sentido na
     conta selecionada — e faz sentido lá, onde existe uma. Aqui o padrão é "todas", e não há
     foco: entrada é `1-`, saída é o resto. As transferências são excluídas pelas próprias
     agregações, então o caso em que os dois critérios discordariam não chega a elas. */
  const itens = useMemo(() => lancs.map((l) => ({
    id: l.id,
    data: l.data_pagamento || l.data_vencimento || l.data_competencia || '',
    mov: ((l.tipo_operacao || '').startsWith('1') ? 1 : -1) * Math.abs(Number(l.valor) || 0),
    tipo: l.tipo_operacao,
    produto: l.descricao,
    fornecedor: (l.favorecido_id && fornMap?.get(l.favorecido_id)) || '',
    doc: l.numero_documento || l.documento || '',
    macro: l.macro_custo ?? null,
    grupo: l.grupo_custo ?? null,
    centro: l.centro_custo ?? null,
    centroPlano: l.centro_custo ?? null,
    escopo: l.escopo_negocio ?? null,
  })), [lancs, fornMap]);

  /* O bloco de topo conta o recorte INTEIRO, transferências incluídas na contagem de linhas e
     excluídas dos valores — a mesma régua das agregações, para os números do topo e os das
     tabelas não contarem coisas diferentes. */
  const totais = useMemo(() => {
    let entradas = 0, saidas = 0;
    for (const it of itens) {
      if (isTransferencia(it.tipo)) continue;
      if (it.mov >= 0) entradas += it.mov; else saidas += Math.abs(it.mov);
    }
    return { entradas, saidas, saldo: entradas - saidas, n: itens.length };
  }, [itens]);

  const periodoLabel = descreverPeriodo(recorte, safraAtual?.nome);
  const contaNome = recorte.contaId
    ? (contas.find((c) => c.id === recorte.contaId)?.nome_exibicao
      || contas.find((c) => c.id === recorte.contaId)?.nome_conta || '—')
    : 'Todas as contas';

  const NUMEROS: { rotulo: string; valor: string; cor?: string }[] = [
    { rotulo: 'Entradas', valor: formatMoeda(totais.entradas), cor: 'text-success' },
    { rotulo: 'Saídas', valor: formatMoeda(totais.saidas), cor: 'text-destructive' },
    { rotulo: 'Saldo', valor: formatMoeda(totais.saldo), cor: totais.saldo >= 0 ? 'text-success' : 'text-destructive' },
    { rotulo: 'Lançamentos', valor: String(totais.n) },
  ];

  return (
    <div className="space-y-3 p-3">
      {/* ── BARRA DE FILTROS — mesmo idioma da lista do Financeiro ── */}
      <div className="flex flex-wrap items-end gap-2 rounded border bg-muted/30 px-2 py-2">
        <div className="w-[170px]">
          <Label className="text-[10px]">Conta</Label>
          <Select value={recorte.contaId ?? TODAS}
            onValueChange={(v) => mexer({ contaId: v === TODAS ? null : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as contas</SelectItem>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[110px]">
          <Label className="text-[10px]">Período</Label>
          <Select value={recorte.modo} onValueChange={(v) => {
            const m = MODOS.find((x) => x.k === v);
            if (m) mexer({ modo: m.k });
          }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MODOS.map((m) => <SelectItem key={m.k} value={m.k}>{m.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {recorte.modo === 'safra' && (
          <div className="w-[230px]">
            <Label className="text-[10px]">Safra</Label>
            {/* ⚠ O ESCOPO NO RÓTULO, e escolher uma safra de lavoura pré-seleciona Lavoura: a
                safra JÁ declara a atividade, e deixar o card em "Todas" faria a primeira
                leitura misturar o que o operador acabou de separar. Ele pode mudar depois. */}
            <Select value={recorte.safraId ?? ''} onValueChange={(v) => {
              const s = safras.find((x) => x.id === v);
              const escopo = ATIVIDADES.find((a) => a.valor === (s?.escopo_negocio ?? ''))?.valor ?? null;
              mexer({ safraId: v, escopo });
            }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha a safra" /></SelectTrigger>
              <SelectContent>
                {safras.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                    {s.escopo_negocio && (
                      <span className="text-muted-foreground">
                        {' · '}{ATIVIDADES.find((a) => a.valor === s.escopo_negocio)?.rotulo ?? s.escopo_negocio}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {recorte.modo === 'ano' && (
          <div className="w-[100px]">
            <Label className="text-[10px]">Ano</Label>
            <Select value={recorte.ano ? String(recorte.ano) : ''} onValueChange={(v) => mexer({ ano: Number(v) })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {recorte.modo === 'datas' && (
          <>
            <div className="w-[130px]">
              <Label className="text-[10px]">De</Label>
              <DatePicker value={recorte.de ?? ''} onChange={(v) => mexer({ de: v || null })} className="h-8 text-xs" />
            </div>
            <div className="w-[130px]">
              <Label className="text-[10px]">Até</Label>
              <DatePicker value={recorte.ate ?? ''} onChange={(v) => mexer({ ate: v || null })} className="h-8 text-xs" />
            </div>
          </>
        )}

        <div className="w-[130px]">
          <Label className="text-[10px]">Atividade</Label>
          <Select value={recorte.escopo ?? TODAS} onValueChange={(v) => {
            const a = ATIVIDADES.find((x) => x.valor === v);
            mexer({ escopo: a ? a.valor : null });
          }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas</SelectItem>
              {ATIVIDADES.map((a) => <SelectItem key={a.valor} value={a.valor}>{a.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* ⚠ O EIXO SOME NO MODO SAFRA, e não fica desabilitado: a safra É o recorte, e um
            campo cinza sugeriria que existe uma resposta que a tela não deixa dar. */}
        {recorte.modo !== 'safra' && (
          <div className="w-[130px]">
            <Label className="text-[10px]">Data por</Label>
            <Select value={recorte.eixo} onValueChange={(v) => {
              const e = EIXOS.find((x) => x.k === v);
              if (e) mexer({ eixo: e.k });
            }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{EIXOS.map((e) => <SelectItem key={e.k} value={e.k}>{e.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <div className="w-[120px]">
          <Label className="text-[10px]">Status</Label>
          <Select value={recorte.status} onValueChange={(v) => {
            const s = STATUS.find((x) => x.k === v);
            if (s) mexer({ status: s.k });
          }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s.k} value={s.k}>{s.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* A frase que explica o botão ausente: aqui não há "Aplicar", então ela explica a
            tela vazia. Mesmo idioma do impedimento da recorrência. */}
        {impedimento && <span className="pb-1.5 text-[10px] text-muted-foreground">{impedimento}</span>}
      </div>

      {/* ── BLOCO DE TOPO (A18) ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NUMEROS.map((n) => (
          <div key={n.rotulo} className="rounded border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{n.rotulo}</div>
            <div className={`text-[20px] font-medium leading-tight tabular-nums ${n.cor ?? ''}`}>{n.valor}</div>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground">
        {contaNome} · {periodoLabel}
        {descreverEixo(recorte) && ` · ${descreverEixo(recorte)}`}
        {recorte.status === 'realizado' ? ' · só realizados' : ' · todos os status'}
        {' · transferências fora dos valores'}
        {(isFetching || abrindo) && ' · carregando…'}
      </div>

      {!impedimento && (
        <>
          {/* ⚠ ENTRADAS À ESQUERDA, SAÍDAS À DIREITA, e a razão é uma pergunta que a tela
              criava sem responder: "Entradas 4,99 mi" ao lado de "Receita 2,74 mi" parece
              erro de conta até alguém mostrar que o resto é captação. O bloco da esquerda é
              a resposta, e é o MESMO componente — só o lado do caixa muda. */}
          <div className="grid gap-2 xl:grid-cols-2">
            <ExtratoDistribuicaoEconomica lado="entrada" itens={itens}
              contaNome={contaNome} periodoLabel={periodoLabel}
              onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
            <ExtratoDistribuicaoEconomica itens={itens}
              contaNome={contaNome} periodoLabel={periodoLabel}
              onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
          </div>

          <div className="grid gap-2 xl:grid-cols-2">
            <ExtratoMaioresCompromissos itens={itens} contaNome={contaNome} periodoLabel={periodoLabel}
              onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
            {/* ⚠ O EIXO É SEMPRE DE 31 DIAS AQUI, e é o que torna a leitura honesta num
                recorte de vários meses: a pergunta é "em que dia do mês o dinheiro sai",
                somando todos os meses do período. Passar o mês corrente cortaria o eixo em
                28 ou 30 e esconderia os dias finais de todos os outros meses. */}
            <ExtratoOrganizacaoPagamentos itens={itens} diasNoEixo={31}
              contaNome={contaNome} periodoLabel={periodoLabel}
              onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
          </div>
        </>
      )}

      <LancamentoV2Dialog
        open={!!editando}
        onClose={() => setEditando(null)}
        onSave={async (form, id) => (id ? fin.editarLancamento(id, form) : fin.criarLancamento(form))}
        lancamento={editando}
        fazendas={fazendas}
        contas={fin.contasBancarias}
        classificacoes={fin.classificacoes}
        fornecedores={fin.fornecedores}
        safras={fin.safras}
        onCriarFornecedor={fin.criarFornecedor}
      />
    </div>
  );
}

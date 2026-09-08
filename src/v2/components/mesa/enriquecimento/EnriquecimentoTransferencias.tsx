/**
 * Transferências entre contas — [ENRIQUECER-GRAVAR-01] (133c item 3). DUMB.
 *
 * ⚠ ESTA LISTA NÃO É DE LINHAS DA PLANILHA, e por isso ela substitui a lista da esquerda em
 * vez de conviver com ela: a unidade aqui é o PAR (uma saída + uma entrada), não a linha.
 * Misturar os dois na mesma lista faria o contador do chip e o tamanho da lista falarem de
 * coisas diferentes.
 *
 * ⚠ O AMBÍGUO PEDE ESCOLHA ANTES DO BOTÃO. Quando a mesma saída casa com mais de uma
 * entrada, unir a primeira é gravar um sorteio — e o efeito (cancelar um lançamento e mover
 * os vínculos do extrato) não é o tipo de coisa que se resolve no chute.
 *
 * ⚠ A SIMULAÇÃO VEM ANTES E É OBRIGATÓRIA. `fn_transferencia_unir(p_simular=true)` diz
 * quantos vínculos do extrato serão movidos; sem esse número, "Unir" promete um efeito que
 * o operador não vê. É a mesma disciplina do botão que diz por que está desabilitado.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtBRL, fmtData } from './fmt';
import type {
  ParEspelhado, SimulacaoUniao, ParEstorno, FaturaCartao,
} from '@/v2/hooks/useTransferenciasEspelhadas';

export interface EnriquecimentoTransferenciasProps {
  pares: readonly ParEspelhado[];
  carregando?: boolean;
  /* ── 133f item 2: as duas famílias que também são "dinheiro que não é despesa" ────── */
  estornos?: readonly ParEstorno[];
  faturas?: readonly FaturaCartao[];
  simularEstorno?: (saidaId: string, entradaId: string) => Promise<unknown>;
  aplicarEstorno?: (saidaId: string, entradaId: string) => Promise<void>;
  simularFatura?: (saidaId: string, cartaoId: string) => Promise<unknown>;
  aplicarFatura?: (saidaId: string, cartaoId: string) => Promise<void>;
  simular: (saidaId: string, entradaId: string) => Promise<SimulacaoUniao | null>;
  unir: (saidaId: string, entradaId: string) => Promise<{ vinculosMovidos: number }>;
  unindo?: boolean;
  onErro: (mensagem: string) => void;
  onUnido: (vinculosMovidos: number) => void;
}

/** As três famílias da tela — a unidade de cada uma é diferente, e a lista diz qual. */
type Secao = 'entre_contas' | 'estorno' | 'fatura';

export function EnriquecimentoTransferencias({
  pares, carregando, simular, unir, unindo, onErro, onUnido,
  estornos = [], faturas = [],
  simularEstorno, aplicarEstorno, simularFatura, aplicarFatura,
}: EnriquecimentoTransferenciasProps) {
  /**
   * ⚠ TRÊS SEÇÕES NUMA LISTA SÓ — 133f item 2. As três respondem à mesma pergunta do
   * operador ("este dinheiro saiu mesmo?") e por isso moram no mesmo chip; mas a UNIDADE de
   * cada uma é outra — um par entre contas, um par na mesma conta, uma saída com candidatos
   * de cartão —, e por isso a lista as separa em vez de misturar.
   */
  const [secao, setSecao] = useState<Secao>('entre_contas');
  /** O item aberto em cada seção. Trocar de seção não carrega a escolha da anterior. */
  const [estornoSel, setEstornoSel] = useState<string | null>(null);
  const [faturaSel, setFaturaSel] = useState<string | null>(null);
  const [cartaoSel, setCartaoSel] = useState<string | null>(null);
  const [simOutros, setSimOutros] = useState<boolean>(false);
  const [prontoOutros, setProntoOutros] = useState<boolean>(false);
  /* A seleção é pela SAÍDA: é ela que sobrevive à união (vira a transferência), e nos
     ambíguos é ela que tem várias entradas candidatas. */
  const [saidaSel, setSaidaSel] = useState<string | null>(null);
  const [entradaSel, setEntradaSel] = useState<string | null>(null);
  const [simulacao, setSimulacao] = useState<SimulacaoUniao | null>(null);
  const [simulando, setSimulando] = useState(false);

  /** Um item por SAÍDA; as entradas candidatas vão juntas. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, { saida: ParEspelhado; candidatas: ParEspelhado[] }>();
    for (const p of pares) {
      const g = mapa.get(p.saida_id);
      if (g) g.candidatas.push(p);
      else mapa.set(p.saida_id, { saida: p, candidatas: [p] });
    }
    return [...mapa.values()];
  }, [pares]);

  const grupoSel = grupos.find((g) => g.saida.saida_id === saidaSel) ?? null;
  const parSel = grupoSel?.candidatas.find((c) => c.entrada_id === entradaSel) ?? null;

  /**
   * ⚠ A SIMULAÇÃO RODA AO ABRIR O PAR — 133d item 5b. Ela era um botão, e o botão era
   * cerimônia: `p_simular=true` não escreve nada, e obrigar um clique para ver um número
   * que a tela podia ter buscado sozinha fazia o operador escolher entre conferir e
   * trabalhar. Trocar de par zera antes de buscar: um número de vínculos de OUTRO par é
   * pior que nenhum, porque parece conferido.
   */
  useEffect(() => {
    setSimulacao(null);
    if (!saidaSel || !entradaSel) return;
    let cancelado = false;
    setSimulando(true);
    simular(saidaSel, entradaSel)
      .then((r) => { if (!cancelado) setSimulacao(r); })
      .catch((e: unknown) => { if (!cancelado) onErro(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelado) setSimulando(false); });
    return () => { cancelado = true; };
  }, [saidaSel, entradaSel, simular, onErro]);

  /* Com uma candidata só, a escolha já está feita — pedir um clique para confirmar o óbvio
     é o tipo de cerimônia que faz o operador parar de ler a tela. */
  useEffect(() => {
    if (grupoSel && grupoSel.candidatas.length === 1) setEntradaSel(grupoSel.candidatas[0].entrada_id);
  }, [grupoSel]);

  const estorno = estornos.find((e) => e.saida_id === estornoSel) ?? null;
  const fatura = faturas.find((f) => f.saida_id === faturaSel) ?? null;

  /* Simula ao abrir — o mesmo gesto do item 5b do 133d: `p_simular` não escreve nada, e
     pedir um clique para ver o efeito faz o operador escolher entre conferir e trabalhar. */
  useEffect(() => {
    setProntoOutros(false);
    if (secao === 'estorno' && estorno && simularEstorno) {
      let cancelado = false; setSimOutros(true);
      simularEstorno(estorno.saida_id, estorno.entrada_id)
        .then(() => { if (!cancelado) setProntoOutros(true); })
        .catch((e: unknown) => { if (!cancelado) onErro(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (!cancelado) setSimOutros(false); });
      return () => { cancelado = true; };
    }
    if (secao === 'fatura' && fatura && cartaoSel && simularFatura) {
      let cancelado = false; setSimOutros(true);
      simularFatura(fatura.saida_id, cartaoSel)
        .then(() => { if (!cancelado) setProntoOutros(true); })
        .catch((e: unknown) => { if (!cancelado) onErro(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (!cancelado) setSimOutros(false); });
      return () => { cancelado = true; };
    }
  }, [secao, estorno, fatura, cartaoSel, simularEstorno, simularFatura, onErro]);

  /* Abrir uma fatura já escolhe o cartão sugerido pelo banco — ele vem da soma do mês, e
     confirmar o óbvio com um clique é a cerimônia que faz o operador parar de ler. */
  useEffect(() => { setCartaoSel(fatura?.sugerido_cartao_id ?? null); }, [fatura]);

  async function handleUnir() {
    if (!parSel) return;
    try {
      const r = await unir(parSel.saida_id, parSel.entrada_id);
      setSaidaSel(null); setEntradaSel(null); setSimulacao(null);
      onUnido(r.vinculosMovidos);
    } catch (e: unknown) {
      onErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid min-h-0 grid-cols-1 items-start gap-1.5 md:flex-1 md:[grid-template-columns:400px_minmax(0,1fr)] md:[grid-template-rows:minmax(0,1fr)]">
      {/* ═══ ESQUERDA: um item por saída ═════════════════════════════════════════ */}
      <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-lg border bg-card md:h-full md:max-h-[calc(100vh-13rem)] md:min-h-0 md:self-stretch">
        {/* ⚠ AS TRÊS SEÇÕES, COM CONTAGEM — 133f item 2. Elas não quebram por dentro; se não
            couberem, o conjunto rola. */}
        <div className="flex shrink-0 flex-nowrap gap-1 overflow-x-auto border-b px-2 py-1">
          {([['entre_contas', 'Entre contas', grupos.length],
             ['estorno', 'Estorno', estornos.length],
             ['fatura', 'Fatura de cartão', faturas.length]] as const).map(([id, rot, n]) => (
            <button key={id} type="button" onClick={() => setSecao(id)}
              className={`flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
                secao === id ? 'border-primary bg-primary/10 text-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted/60'
              } ${n === 0 && secao !== id ? 'opacity-45' : ''}`}>
              <span>{rot}</span><span className="tabular-nums font-medium">{n}</span>
            </button>
          ))}
        </div>
        {secao !== 'entre_contas' ? (
          /* ⚠ LISTAS PRÓPRIAS, MESMA ANATOMIA — 133f item 2: identidade em 11px/500, contexto
              em 10px, valor à direita e pílula "pendente"/"feito". O que muda é a unidade. */
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {(secao === 'estorno' ? estornos.length : faturas.length) === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                {secao === 'estorno'
                  ? 'Nenhuma saída deste mês voltou como entrada na mesma conta.'
                  : 'Nenhuma saída deste mês parece pagamento de fatura de cartão.'}
              </p>
            ) : secao === 'estorno' ? estornos.map((e) => {
              const sel = e.saida_id === estornoSel;
              return (
                <button key={e.saida_id} type="button" onClick={() => setEstornoSel(e.saida_id)}
                  className={`grid h-9 w-full items-center gap-1.5 rounded px-3 py-[5px] text-left transition-colors ${
                    sel ? 'bg-primary/10 outline outline-1 outline-primary' : 'bg-card hover:bg-muted/50'}`}
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 96px' }}>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium leading-[1.3]" title={e.conta ?? ''}>
                      {e.conta ?? '—'} · estorno de {fmtBRL(e.valor)}
                    </span>
                    <span className="block truncate text-[10px] leading-[1.3] text-muted-foreground"
                      title={`${e.desc_saida ?? ''} · ${e.desc_entrada ?? ''}`}>
                      {fmtData(e.dia_saida)} · {e.desc_saida || '—'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] font-medium leading-[1.3] tabular-nums">{fmtBRL(e.valor)}</span>
                    <span className={`block text-[10px] leading-[1.3] ${
                      e.ja_classificado ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}>
                      {e.ja_classificado ? 'feito' : 'pendente'}
                    </span>
                  </span>
                </button>
              );
            }) : faturas.map((f) => {
              const sel = f.saida_id === faturaSel;
              const sugerido = f.candidatos.find((c) => c.cartao_id === f.sugerido_cartao_id);
              return (
                <button key={f.saida_id} type="button" onClick={() => setFaturaSel(f.saida_id)}
                  className={`grid h-9 w-full items-center gap-1.5 rounded px-3 py-[5px] text-left transition-colors ${
                    sel ? 'bg-primary/10 outline outline-1 outline-primary' : 'bg-card hover:bg-muted/50'}`}
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 96px' }}>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium leading-[1.3]"
                      title={`${f.conta ?? '—'} → ${sugerido?.cartao ?? 'cartão a escolher'}`}>
                      {f.conta ?? '—'} → {sugerido?.cartao ?? 'cartão a escolher'} · fatura {fmtBRL(f.valor)}
                    </span>
                    <span className="block truncate text-[10px] leading-[1.3] text-muted-foreground"
                      title={f.descricao ?? ''}>
                      {fmtData(f.dia)} · {f.descricao || '—'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] font-medium leading-[1.3] tabular-nums">{fmtBRL(f.valor)}</span>
                    <span className={`block text-[10px] leading-[1.3] ${
                      f.ja_transferencia ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}>
                      {f.ja_transferencia ? 'feito' : 'pendente'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : carregando ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">Procurando transferências…</p>
        ) : grupos.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            Nenhuma saída deste mês casa com uma entrada de mesmo valor em outra conta.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {grupos.map(({ saida, candidatas }) => {
              const sel = saida.saida_id === saidaSel;
              const ambiguo = candidatas.length > 1 || saida.ambiguo;
              return (
                <button key={saida.saida_id} type="button"
                  onClick={() => { setSaidaSel(saida.saida_id); setEntradaSel(candidatas.length === 1 ? candidatas[0].entrada_id : null); }}
                  className={`grid h-9 w-full items-center gap-1.5 rounded px-3 py-[5px] text-left transition-colors ${
                    sel ? 'bg-primary/10 outline outline-1 outline-primary' : 'bg-card hover:bg-muted/50'}`}
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 96px' }}>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium leading-[1.3]"
                      title={`${saida.conta_saida ?? '—'} → ${candidatas.map((c) => c.conta_entrada ?? '—').join(' / ')}`}>
                      {saida.conta_saida ?? '—'} → {ambiguo ? `${candidatas.length} contas` : (saida.conta_entrada ?? '—')}
                    </span>
                    <span className="block truncate text-[10px] leading-[1.3] text-muted-foreground"
                      title={saida.desc_saida ?? ''}>
                      {fmtData(saida.dia_saida)} · {saida.desc_saida || '—'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] font-medium leading-[1.3] tabular-nums">
                      {fmtBRL(saida.valor)}
                    </span>
                    <span className={`block text-[10px] leading-[1.3] ${
                      ambiguo ? 'text-amber-700 dark:text-amber-400' : 'text-sky-700 dark:text-sky-400'}`}>
                      {ambiguo ? 'você decide' : 'único'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ DIREITA ═════════════════════════════════════════════════════════════ */}
      <div className="flex min-h-0 flex-col gap-1 md:h-full">
        {secao === 'estorno' ? (
          !estorno ? (
            <div className="rounded-lg border bg-card p-4 text-center text-[11px] text-muted-foreground">
              Escolha um estorno à esquerda para conferir os dois lançamentos.
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="grid shrink-0 gap-0 border-b md:grid-cols-2">
                  <Lado titulo="Saída" conta={estorno.conta} dia={estorno.dia_saida}
                    valor={estorno.valor} descricao={estorno.desc_saida} />
                  <div className="border-t md:border-l md:border-t-0">
                    <Lado titulo="Entrada (a volta)" conta={estorno.conta} dia={estorno.dia_entrada}
                      valor={estorno.valor} descricao={estorno.desc_entrada} />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  Aplicar marca a saída como <b>Pagamento Estornado</b> e a entrada como
                  <b> Estorno Recebido</b>, e tira as duas da DRE. O dinheiro saiu e voltou na mesma
                  conta: enquanto ficam soltos, o mês mostra uma despesa que não existiu.
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1">
                <span className="min-w-0 flex-1 text-[10px] leading-tight text-muted-foreground">
                  {estorno.ja_classificado ? 'Este par já foi classificado — nada a aplicar.'
                    : simOutros ? 'Conferindo o que a aplicação muda…'
                    : prontoOutros ? 'Conferido. Nada foi gravado ainda.'
                    : 'Não foi possível conferir o efeito.'}
                </span>
                <Button type="button" size="sm" className="h-6 px-2 text-[10px]"
                  disabled={!aplicarEstorno || estorno.ja_classificado || !prontoOutros || unindo || simOutros}
                  title={estorno.ja_classificado ? 'Já classificado.' : undefined}
                  onClick={() => {
                    void aplicarEstorno?.(estorno.saida_id, estorno.entrada_id)
                      .then(() => { setEstornoSel(null); onUnido(0); })
                      .catch((e: unknown) => onErro(e instanceof Error ? e.message : String(e)));
                  }}>
                  Aplicar estorno
                </Button>
              </div>
            </>
          )
        ) : secao === 'fatura' ? (
          !fatura ? (
            <div className="rounded-lg border bg-card p-4 text-center text-[11px] text-muted-foreground">
              Escolha uma fatura à esquerda para conferir a saída e o cartão.
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="shrink-0 border-b">
                  <Lado titulo="Saída da conta corrente" conta={fatura.conta} dia={fatura.dia}
                    valor={fatura.valor} descricao={fatura.descricao} />
                </div>
                {/* ⚠ "BATE" É DO BANCO, não conta do front: a soma do mês de cada cartão vem da
                    RPC. Recalcular aqui seria a segunda resposta para "esta fatura é deste
                    cartão?", e ela divergiria na primeira mudança da regra. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
                  <p className="px-1 pb-1 text-[10px] text-muted-foreground">
                    Cartões do cliente e o quanto cada um somou no mês:
                  </p>
                  {fatura.candidatos.length === 0 ? (
                    <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
                      Nenhum cartão com movimento no mês — sem candidato a esta fatura.
                    </p>
                  ) : fatura.candidatos.map((c) => (
                    <label key={c.cartao_id}
                      className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/50">
                      <input type="radio" name={`cartao-${fatura.saida_id}`} className="h-3 w-3 shrink-0"
                        checked={cartaoSel === c.cartao_id}
                        onChange={() => setCartaoSel(c.cartao_id)} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={c.cartao ?? ''}>
                        {c.cartao ?? '—'}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums">{fmtBRL(c.soma_mes)}</span>
                      <span className={`w-10 shrink-0 text-right text-[10px] ${
                        c.bate ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {c.bate ? 'bate' : '—'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1">
                <span className="min-w-0 flex-1 text-[10px] leading-tight text-muted-foreground">
                  {fatura.ja_transferencia ? 'Esta fatura já é transferência — nada a unir.'
                    : !cartaoSel ? 'Escolha o cartão para habilitar.'
                    : simOutros ? 'Conferindo o que a união muda…'
                    : prontoOutros ? 'Conferido. Nada foi gravado ainda.'
                    : 'Não foi possível conferir o efeito.'}
                </span>
                <Button type="button" size="sm" className="h-6 px-2 text-[10px]"
                  disabled={!aplicarFatura || fatura.ja_transferencia || !cartaoSel || !prontoOutros || unindo || simOutros}
                  onClick={() => {
                    if (!cartaoSel) return;
                    void aplicarFatura?.(fatura.saida_id, cartaoSel)
                      .then(() => { setFaturaSel(null); onUnido(0); })
                      .catch((e: unknown) => onErro(e instanceof Error ? e.message : String(e)));
                  }}>
                  Unir como fatura do {fatura.candidatos.find((c) => c.cartao_id === cartaoSel)?.cartao ?? 'cartão'}
                </Button>
              </div>
            </>
          )
        ) : !grupoSel ? (
          <div className="rounded-lg border bg-card p-4 text-center text-[11px] text-muted-foreground">
            Escolha um par à esquerda para conferir os dois lançamentos.
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
              <div className="grid shrink-0 gap-0 border-b md:grid-cols-2">
                <Lado titulo="Saída" conta={grupoSel.saida.conta_saida} dia={grupoSel.saida.dia_saida}
                  valor={grupoSel.saida.valor} descricao={grupoSel.saida.desc_saida} />
                <div className="border-t md:border-l md:border-t-0">
                  {grupoSel.candidatas.length === 1 ? (
                    <Lado titulo="Entrada" conta={grupoSel.candidatas[0].conta_entrada}
                      dia={grupoSel.candidatas[0].dia_entrada} valor={grupoSel.candidatas[0].valor}
                      descricao={grupoSel.candidatas[0].desc_entrada} />
                  ) : (
                    <div className="px-3 py-1.5">
                      <div className="text-[10px] leading-tight text-muted-foreground">
                        Entrada — {grupoSel.candidatas.length} candidatas
                      </div>
                      {/* ⚠ RADIO: uma saída vira UMA transferência. Escolher duas entradas
                          não é um caso que exista — seria outro fato. */}
                      <div className="mt-0.5 max-h-[120px] space-y-0.5 overflow-y-auto">
                        {grupoSel.candidatas.map((c) => (
                          <label key={c.entrada_id}
                            className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/50">
                            <input type="radio" name={`entrada-${grupoSel.saida.saida_id}`}
                              className="h-3 w-3 shrink-0"
                              checked={entradaSel === c.entrada_id}
                              onChange={() => setEntradaSel(c.entrada_id)} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium" title={c.conta_entrada ?? ''}>
                                {c.conta_entrada ?? '—'}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground" title={c.desc_entrada ?? ''}>
                                {fmtData(c.dia_entrada)} · {c.desc_entrada || '—'}
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] font-medium tabular-nums">{fmtBRL(c.valor)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Unir marca a <b>saída</b> como <b>3-Transferências</b> com a conta de destino da entrada,
                move para ela os vínculos do extrato que hoje apontam para a entrada, e cancela a entrada
                com o motivo registrado. O dinheiro deixa de ser contado duas vezes no mês.
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1">
              {/* ⚠ O MOTIVO DO DESABILITADO FICA ESCRITO, e é a fonte única do `disabled`. */}
              <span className="min-w-0 flex-1 text-[10px] leading-tight text-muted-foreground">
                {!parSel ? 'Escolha a entrada correspondente para habilitar.'
                  : simulando ? 'Conferindo o que a união move…'
                  : simulacao ? <>Vínculos a mover: <b className="tabular-nums">{simulacao.vinculos_a_mover}</b>. Nada foi gravado ainda.</>
                  : 'Não foi possível conferir o que a união move.'}
              </span>
              <Button type="button" size="sm" className="h-6 px-2 text-[10px]"
                disabled={!parSel || !simulacao || unindo || simulando}
                title={!parSel ? 'Escolha a entrada correspondente.'
                  : simulando ? 'Conferindo…'
                  : !simulacao ? 'A conferência prévia falhou — sem ela, unir gravaria às cegas.'
                  : undefined}
                onClick={() => { void handleUnir(); }}>
                {unindo ? 'Unindo…' : 'Unir como transferência'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Lado({ titulo, conta, dia, valor, descricao }: {
  titulo: string; conta: string | null; dia: string; valor: number; descricao: string | null;
}) {
  return (
    <div className="min-w-0 px-3 py-1.5">
      <div className="text-[10px] leading-tight text-muted-foreground">{titulo}</div>
      <div className="truncate text-[16px] font-medium leading-tight tabular-nums" title={conta ?? undefined}>
        {fmtBRL(valor)}
      </div>
      <div className="truncate text-[10px] leading-tight text-muted-foreground" title={`${conta ?? '—'} · ${descricao ?? ''}`}>
        {fmtData(dia)} · {conta ?? '—'}
      </div>
      <div className="truncate text-[10px] leading-tight text-muted-foreground" title={descricao ?? ''}>
        {descricao || '—'}
      </div>
    </div>
  );
}

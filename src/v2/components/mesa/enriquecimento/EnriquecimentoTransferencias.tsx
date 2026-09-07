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
import type { ParEspelhado, SimulacaoUniao } from '@/v2/hooks/useTransferenciasEspelhadas';

export interface EnriquecimentoTransferenciasProps {
  pares: readonly ParEspelhado[];
  carregando?: boolean;
  simular: (saidaId: string, entradaId: string) => Promise<SimulacaoUniao | null>;
  unir: (saidaId: string, entradaId: string) => Promise<{ vinculosMovidos: number }>;
  unindo?: boolean;
  onErro: (mensagem: string) => void;
  onUnido: (vinculosMovidos: number) => void;
}

export function EnriquecimentoTransferencias({
  pares, carregando, simular, unir, unindo, onErro, onUnido,
}: EnriquecimentoTransferenciasProps) {
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

  /* Trocar de par zera a simulação: um número de vínculos de outro par seria pior que
     nenhum — ele parece conferido. */
  useEffect(() => { setSimulacao(null); }, [saidaSel, entradaSel]);

  /* Com uma candidata só, a escolha já está feita — pedir um clique para confirmar o óbvio
     é o tipo de cerimônia que faz o operador parar de ler a tela. */
  useEffect(() => {
    if (grupoSel && grupoSel.candidatas.length === 1) setEntradaSel(grupoSel.candidatas[0].entrada_id);
  }, [grupoSel]);

  async function handleSimular() {
    if (!parSel) return;
    setSimulando(true);
    try {
      setSimulacao(await simular(parSel.saida_id, parSel.entrada_id));
    } catch (e: unknown) {
      onErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSimulando(false);
    }
  }

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
        <div className="flex shrink-0 items-baseline justify-between border-b bg-muted/40 px-2 py-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Pares espelhados
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{grupos.length}</span>
        </div>
        {carregando ? (
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

      {/* ═══ DIREITA: saída | entrada, lado a lado ═══════════════════════════════ */}
      <div className="flex min-h-0 flex-col gap-1 md:h-full">
        {!grupoSel ? (
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
                  : simulacao ? <>Vínculos a mover: <b className="tabular-nums">{simulacao.vinculos_a_mover}</b>. Nada foi gravado ainda.</>
                  : 'Confira a simulação antes de unir — ela diz quantos vínculos do extrato mudam de dono.'}
              </span>
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                disabled={!parSel || simulando}
                onClick={() => { void handleSimular(); }}>
                {simulando ? 'Simulando…' : 'Simular'}
              </Button>
              <Button type="button" size="sm" className="h-6 px-2 text-[10px]"
                disabled={!parSel || !simulacao || unindo}
                title={!parSel ? 'Escolha a entrada correspondente.'
                  : !simulacao ? 'Simule primeiro: a simulação diz quantos vínculos do extrato serão movidos.'
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

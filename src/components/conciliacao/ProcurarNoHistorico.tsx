/**
 * ProcurarNoHistorico — P153 (CONC-HISTORICO-01, Gabriel 28/10). O movimento do banco sem nada em aberto acha COMO FOI LANÇADO ANTES:
 * o mesmo nome no texto do banco já casado, na descrição ou no fornecedor (`fn_conciliacao_historico_buscar`), e "Criar igual" abre o
 * Criar de hoje com fornecedor, subcentro, fazenda e descrição do achado (o valor, a data e a conta continuam os do movimento).
 * O MESMO componente no "Sugestões para casar" (Conferência) e na estação "Conciliar movimento do extrato".
 *
 * P153b (Gabriel 29/10): TODOS os status. O EM ABERTO se CASA ("Casar"; de outra conta, "Casar e trocar conta" — a `fn_espelho_casar`
 * com `trocar_conta`, numa transação); o pago/conciliado é modelo ("Criar igual"; de outra conta, com o selo "outra conta" — nunca casa).
 * CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36): a MESMA tabela das sugestões, que é a da lista do Financeiro (`TabelaParaCasar` sobre
 * `TabelaDaLista`): ☐ · Comp. · Venc. · Pgto. · Descrição · Fornecedor · Faz. (o CÓDIGO) · NF · Valor · Status · Motivo · ação. O subcentro e
 * o que o banco disse vão no `title` da descrição; a conta de outra conta é o selo "outra conta" no Motivo. A caixinha (com `selecao`) soma
 * com as das sugestões no rodapé do modal; o pago não se marca (só "Criar igual"). A mais recente primeiro; as colunas ordenam (clique no
 * cabeçalho, ↑↓). As fontes são as da lista do Financeiro.
 * O "até" da busca é o fim do MÊS SEGUINTE ao extrato: o em aberto que vence depois do movimento entra (Gabriel, 30/10).
 *
 * ⚠ BUSCAR É GESTO (Procurar ou Enter): nada sai sozinho ao abrir.
 * ⚠ D1: banco sem nome (Bradesco "PIX ENVIADO", Sicredi com 8 dígitos) = o campo VAZIO e a frase "o banco não trouxe o nome: digite".
 * ⚠ "NÃO CONSEGUI" NUNCA VIRA "NADA ACHADO" (P146): a recusa ou o formato inesperado dizem "Não consegui procurar" e oferecem de novo.
 * ⚠ LAYOUT FIXO: a linha do campo e o quadro têm altura fixa (na estação, 6 linhas; no modal, `preencher` = o que sobra dele) — nada se
 *   desloca entre "antes de procurar", "procurando", "nada achado" e a lista. Na tabela, texto = uma linha com "…" e o inteiro no `title`.
 *   A FRASE (a faixa amarela e a do D1) é a 1ª linha DO QUADRO: fora de tabela o "…" reprova (o gate de 29/10 a pegou).
 * ⚠ O QUADRO TEM PISO (`PISO_DO_QUADRO`): abaixo dele rola na horizontal dentro da caixa; o cabeçalho só fica PRESO quando o quadro rola.
 */
import { useEffect, useMemo, useState, type Ref } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { nomeDoHistorico } from '@/lib/conciliacao/nomeDoHistorico';
import { TabelaDaLista } from '@/components/financeiro-v2/TabelaDaLista';
import { CabecalhoParaCasar, LinhaParaCasarNaTabela, LINK_PARA_CASAR, ALTURA_DA_LINHA_PARA_CASAR, colunasParaCasar, largurasParaCasar,
  ALTURA_DO_CABECALHO_PARA_CASAR, PISO_PARA_CASAR } from '@/components/conciliacao/TabelaParaCasar';
import { lerComplementoDasLinhas, type ComplementoDaLinha } from '@/lib/conciliacao/complementoDasLinhas';
import {
  lerResultado, fraseDaFaixa, modeloDoAchado, contagemDosAchados, ONDE_TODOS, acaoDoAchado, outraConta, ordenarAchados, proximaOrdem,
  fimDoMesSeguinte, ORDEM_PADRAO,
  type AchadoDoHistorico, type ColunaDoHistorico, type ModeloDoHistorico, type OndeProcurar, type OrdemDoHistorico, type ResultadoDoHistorico,
} from '@/lib/conciliacao/procurarNoHistorico';

interface Props {
  clienteId: string | null;
  movimento: { data: string | null; historico: string | null; valor: number };
  onCriarIgual: (m: ModeloDoHistorico) => void;
  /** P159f — o campo da busca, para quem monta pôr o cursor nele (o modal sem sugestão automática) */
  campoRef?: Ref<HTMLInputElement>;
  /** P153b — casar o achado EM ABERTO com o movimento (`trocarConta` = o de outra conta). Sem ele (a estação), só "Criar igual". */
  onCasar?: (a: AchadoDoHistorico, trocarConta: boolean) => void;
  /** P153b — a conta do movimento: decide "outra conta" e o texto do "Casar e trocar a conta para …" */
  contaDoExtrato?: { id: string | null; nome?: string | null };
  /** P153b — o quadro ocupa a altura que sobra de quem monta (o modal de altura toda); sem ele, 6 linhas fixas (a estação). */
  preencher?: boolean;
  /** CONC-SUGESTOES-TABELA-01 — a caixinha de cada achado EM ABERTO (soma com as sugestões no rodapé do modal). Sem ela (a estação), a
   *  coluna fica vazia: a estação marca pela lista de candidatos dela. */
  selecao?: { marcado: (id: string) => boolean; alternar: (a: AchadoDoHistorico, trocarConta: boolean) => void };
}

const ROTULO: Record<OndeProcurar, string> = { banco: 'texto do banco', descricao: 'descrição', fornecedor: 'fornecedor' };
const LINHAS_A_VISTA = 6;
/* as fixas + 2 × 120 para Descrição e Fornecedor */
const PISO_DO_QUADRO = PISO_PARA_CASAR;
const SELO_OUTRA = 'selo-motivo inline-block max-w-full truncate rounded-[3px] border border-amber-500 bg-amber-50 px-[3px] text-[8px] font-semibold leading-[12px] text-amber-700';

type Estado =
  | { tipo: 'antes' }
  | { tipo: 'procurando' }
  | { tipo: 'falhou'; motivo: string }
  | { tipo: 'pronto'; termo: string; r: ResultadoDoHistorico };

export function ProcurarNoHistorico({ clienteId, movimento, onCriarIgual, campoRef, onCasar, contaDoExtrato, preencher, selecao }: Props) {
  const nomeDoBanco = nomeDoHistorico(movimento.historico, movimento.data);
  const ano = Number((movimento.data ?? '').slice(0, 4)) || new Date().getFullYear();
  const [termo, setTermo] = useState(nomeDoBanco);
  const [onde, setOnde] = useState<ReadonlySet<OndeProcurar>>(new Set(ONDE_TODOS));
  const [desdeAno, setDesdeAno] = useState(ano);
  const [estado, setEstado] = useState<Estado>({ tipo: 'antes' });
  const [ordem, setOrdem] = useState<OrdemDoHistorico>(ORDEM_PADRAO);

  const podeProcurar = !!clienteId && termo.trim().length >= 2 && onde.size > 0 && estado.tipo !== 'procurando';
  const contaId = contaDoExtrato?.id ?? null;
  const nomeContaExtrato = contaDoExtrato?.nome ?? 'a conta do extrato';

  const procurar = async () => {
    if (!podeProcurar || !clienteId) return;
    const t = termo.trim();
    setEstado({ tipo: 'procurando' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_conciliacao_historico_buscar', {
      p_cliente: clienteId, p_termo: t, p_onde: ONDE_TODOS.filter((o) => onde.has(o)),
      p_de: `${desdeAno}-01-01`, p_ate: fimDoMesSeguinte(movimento.data), p_valor: movimento.valor,
    });
    if (error) { console.error('[ProcurarNoHistorico]', error); setEstado({ tipo: 'falhou', motivo: 'o banco recusou a busca' }); return; }
    const r = lerResultado(data);
    if (!r) { console.error('[ProcurarNoHistorico] resposta inesperada', data); setEstado({ tipo: 'falhou', motivo: 'a resposta veio num formato inesperado' }); return; }
    setEstado({ tipo: 'pronto', termo: t, r });
  };

  const alternar = (o: OndeProcurar) => setOnde((s) => {
    const n = new Set(s); if (n.has(o)) n.delete(o); else n.add(o); return n;
  });

  const achados = useMemo(() => (estado.tipo === 'pronto' ? ordenarAchados(estado.r.achados, ordem) : []), [estado, ordem]);
  /* o nº da NF de cada achado (a busca não o traz): uma leitura pelos ids, depois de procurar */
  const [complemento, setComplemento] = useState<ReadonlyMap<string, ComplementoDaLinha>>(new Map());
  useEffect(() => {
    let vivo = true;
    if (!clienteId || estado.tipo !== 'pronto' || !estado.r.achados.length) { setComplemento(new Map()); return; }
    void lerComplementoDasLinhas(clienteId, estado.r.achados.map((a) => a.lancamentoId)).then((m) => { if (vivo) setComplemento(m ?? new Map()); });
    return () => { vivo = false; };
  }, [clienteId, estado]);
  const faixa = estado.tipo === 'pronto' ? fraseDaFaixa(estado.termo, estado.r.resumo) : null;
  const frase = faixa?.curta ?? (!nomeDoBanco && estado.tipo === 'antes' ? 'o banco não trouxe o nome: digite' : null);
  const contagem = estado.tipo === 'pronto' ? contagemDosAchados(estado.r) : estado.tipo === 'procurando' ? 'procurando…' : '';
  const alturaFixa = ALTURA_DO_CABECALHO_PARA_CASAR + LINHAS_A_VISTA * ALTURA_DA_LINHA_PARA_CASAR + 2;
  /* o cabeçalho só fica PRESO quando o quadro rola de fato (mais linhas que as à vista) — preso num quadro que não rola é vão (P153) */
  const linhasNoQuadro = (frase ? 1 : 0) + (estado.tipo === 'pronto' ? Math.max(1, achados.length) : estado.tipo === 'falhou' ? 1 : 0);
  /* UI-FONTE-GATE-01: Faz. e NF só quando algum achado tem o dado (a largura vazia vai para Descrição e Fornecedor) */
  const colunas = colunasParaCasar(achados.map((a) => ({ fazendaCodigo: a.fazendaCodigo ?? a.fazenda ?? null, fazendaNome: a.fazenda ?? null,
    numeroDocumento: complemento.get(a.lancamentoId)?.numeroDocumento ?? null })));
  const larguras = largurasParaCasar(colunas);

  return (
    <div className={cn('mt-2', preencher && 'flex min-h-0 flex-1 flex-col')} data-testid="procurar-historico">
      {/* a linha do campo: altura fixa, nada quebra */}
      <div className="flex h-[24px] shrink-0 items-center gap-1.5 text-[10px]">
        {/* abaixo de 900px de janela o rótulo encolhe para "Procurar" e o campo fica com a largura do nome (o gate de 04/11 mediu 80px a 750) */}
        <span className="shrink-0 whitespace-nowrap font-semibold text-foreground">Procurar<span className="hidden min-[900px]:inline"> no histórico</span></span>
        <Input ref={campoRef} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="nome do fornecedor ou do banco"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void procurar(); } }}
          className="h-[22px] w-auto min-w-[80px] flex-1 px-1.5 text-[10px]" data-testid="procurar-historico-termo" aria-label="Procurar no histórico" />
        {ONDE_TODOS.map((o) => (
          <label key={o} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground">
            <Checkbox checked={onde.has(o)} onCheckedChange={() => alternar(o)} className="h-3 w-3" data-testid={`procurar-onde-${o}`} />
            {ROTULO[o]}
          </label>
        ))}
        <button type="button" onClick={() => setDesdeAno((a) => (a === ano ? ano - 1 : ano))} data-testid="procurar-periodo"
          className="shrink-0 whitespace-nowrap rounded border px-1.5 leading-[18px] text-muted-foreground hover:bg-muted"
          title={desdeAno === ano ? `Procurar também em ${ano - 1}` : `Procurar só a partir de ${ano}`}>
          desde jan/{desdeAno}
        </button>
        <button type="button" onClick={() => void procurar()} disabled={!podeProcurar} data-testid="procurar-historico-botao"
          className="shrink-0 rounded bg-primary px-2 leading-[20px] font-semibold text-primary-foreground disabled:opacity-50">
          Procurar
        </button>
        {/* a contagem tem lugar reservado: "procurando…", "N achados" e vazio ocupam o mesmo (vazio = um espaço fixo) */}
        <span className="ml-auto w-[64px] shrink-0 truncate text-right tabular-nums text-muted-foreground" title={contagem || undefined}
          data-testid="procurar-historico-contagem">{contagem || ' '}</span>
      </div>

      {/* ⚠ o quadro: ALTURA fixa (na estação, cabeçalho + 6 linhas; no modal, o que sobra dele), o vazio fica dentro; o corpo rola aqui */}
      <div className={cn('mt-1 overflow-auto rounded-sm border bg-card', preencher && 'min-h-0 flex-1')}
        style={preencher ? { minHeight: ALTURA_DO_CABECALHO_PARA_CASAR + 2 * ALTURA_DA_LINHA_PARA_CASAR + 2 } : { height: alturaFixa }} data-testid="procurar-historico-quadro">
        <div style={{ minWidth: PISO_DO_QUADRO }} data-testid="procurar-historico-piso">
        <TabelaDaLista larguras={larguras} cabecalhoPreso={!!preencher || linhasNoQuadro > LINHAS_A_VISTA} cabecalho={<CabecalhoParaCasar prefixo="procurar" colunas={colunas}
          ordenar={(k) => setOrdem((o) => proximaOrdem(o, k))} seta={(k) => (ordem.coluna === k ? (ordem.sentido === 'asc' ? '↑' : '↓') : '')} />}>
            {frase && (
              <tr style={{ height: ALTURA_DA_LINHA_PARA_CASAR }}>
                <td colSpan={larguras.length} className={cn('truncate px-1', faixa ? 'bg-amber-50 text-amber-800' : 'text-muted-foreground')}
                  title={faixa?.inteira ?? frase} data-testid="procurar-historico-frase">{frase}</td>
              </tr>
            )}
            {estado.tipo === 'falhou' && (
              <tr style={{ height: ALTURA_DA_LINHA_PARA_CASAR }}>
                <td colSpan={larguras.length} className="truncate px-1 text-muted-foreground">
                  Não consegui procurar: {estado.motivo}.{' '}
                  <button type="button" onClick={() => void procurar()} className="font-semibold text-[#1d4ed8] underline underline-offset-2">Tentar de novo</button>
                </td>
              </tr>
            )}
            {estado.tipo === 'pronto' && achados.length === 0 && (
              <tr style={{ height: ALTURA_DA_LINHA_PARA_CASAR }}><td colSpan={larguras.length} className="px-1 italic text-muted-foreground">nada achado com "{estado.termo}"</td></tr>
            )}
            {achados.map((a) => {
              const acao = acaoDoAchado(a, contaId, !!onCasar);
              const outra = outraConta(a, contaId);
              const tituloDescricao = [a.descricao, [a.centro, a.subcentro].filter(Boolean).join(' · ') || null, a.banco ? `O banco: ${a.banco}` : null]
                .filter(Boolean).join('\n') || undefined;
              const x = complemento.get(a.lancamentoId);
              const casa = acao !== 'criar_igual';
              return (
                <LinhaParaCasarNaTabela key={a.lancamentoId} colunas={colunas} testidDaLinha="procurar-historico-achado" dadoAcao={acao} testid="procurar-acao"
                  l={{ id: a.lancamentoId, comp: a.dataCompetencia, venc: a.dataVencimento, pgto: a.dataPagamento, descricao: a.descricao, tituloDescricao,
                    fornecedor: a.fornecedor, fazendaCodigo: a.fazendaCodigo ?? a.fazenda, fazendaNome: a.fazenda,
                    tipoDocumento: x?.tipoDocumento ?? null, numeroDocumento: x?.numeroDocumento ?? null, valor: a.valor, status: a.status, conciliado: a.conciliado }}
                  marcada={!!selecao?.marcado(a.lancamentoId)} podeMarcar={!!selecao && casa}
                  motivoMarcar={selecao ? 'Pago: não se casa de novo — use "Criar igual".' : undefined}
                  alternar={() => selecao?.alternar(a, acao === 'casar_trocando_conta')}
                  motivo={outra
                    ? <span className={SELO_OUTRA} title={`Conta: ${a.conta ?? '—'} — não é a do extrato (${nomeContaExtrato})`} data-testid="procurar-outra-conta">outra conta</span>
                    : <span className="text-muted-foreground" title={a.conta ?? undefined}>{casa ? 'em aberto' : 'pago · modelo'}</span>}
                  acao={acao === 'criar_igual' ? (
                    <button type="button" onClick={() => onCriarIgual(modeloDoAchado(a))} data-testid="procurar-criar-igual" className={LINK_PARA_CASAR}>
                      Criar igual
                    </button>
                  ) : (
                    <button type="button" onClick={() => onCasar?.(a, acao === 'casar_trocando_conta')}
                      data-testid={acao === 'casar' ? 'procurar-casar' : 'procurar-casar-trocando'}
                      title={acao === 'casar' ? 'Casar com o movimento do banco' : `Casar e trocar a conta para ${nomeContaExtrato}`}
                      className={LINK_PARA_CASAR}>
                      Casar
                    </button>
                  )} />
              );
            })}
        </TabelaDaLista>
        </div>
      </div>
    </div>
  );
}

/**
 * ProcurarNoHistorico — P153 (CONC-HISTORICO-01, Gabriel 28/10). O movimento do banco sem nada em aberto acha COMO FOI LANÇADO ANTES:
 * o mesmo nome no texto do banco já casado, na descrição ou no fornecedor (`fn_conciliacao_historico_buscar`), e "Criar igual" abre o
 * Criar de hoje com fornecedor, subcentro, fazenda e descrição do achado (o valor, a data e a conta continuam os do movimento).
 * O MESMO componente no "Sugestões para casar" (Conferência) e na estação "Conciliar movimento do extrato".
 *
 * P153b (Gabriel 29/10): TODOS os status. O EM ABERTO se CASA ("Casar"; de outra conta, "Casar e trocar conta" — a `fn_espelho_casar`
 * com `trocar_conta`, numa transação); o pago/conciliado é modelo ("Criar igual"; de outra conta, com o selo "outra conta" — nunca casa).
 * As colunas da casa: Comp. · Venc. · Pgto. · Descrição · Fornecedor · Subcentro · Faz. (o CÓDIGO) · Conta · Valor · Status · ação; o que
 * o banco disse vai no `title` da descrição. A mais recente primeiro; TODA coluna ordena (clique no cabeçalho, ↑↓). 9px, linha de 17px,
 * cabeçalho de 8,5px (EXCEÇÃO DECLARADA ao piso de 9,5 — pedido do Gabriel, a lista larga num modal de até 1400px).
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
import { useMemo, useState, type Ref } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { dataBR } from '@/lib/datas/dataBR';
import { fmtBRL } from '@/components/conciliacao/TabelaExtratoDoMes';
import { nomeDoHistorico } from '@/lib/conciliacao/nomeDoHistorico';
import { STATUS_PALETA, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
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
}

const ROTULO: Record<OndeProcurar, string> = { banco: 'texto do banco', descricao: 'descrição', fornecedor: 'fornecedor' };
/* ⚠ AS LARGURAS a 9px tabular: data "00/00/0000" (~47) + 8 = 58 · Subcentro 110 · Faz. 40 (o código, "PUR") · Conta 92 · Valor 88 (o teto
   "-99.999.999,99") · Status 62 ("Conciliado") · ação 112 ("Casar e trocar conta"). Descrição e Fornecedor dividem o resto. */
const COLUNAS: readonly { k: ColunaDoHistorico | null; rotulo: string; w: number | null; direita?: boolean }[] = [
  { k: 'comp', rotulo: 'Comp.', w: 58 }, { k: 'venc', rotulo: 'Venc.', w: 58 }, { k: 'pgto', rotulo: 'Pgto.', w: 58 },
  { k: 'descricao', rotulo: 'Descrição', w: null }, { k: 'fornecedor', rotulo: 'Fornecedor', w: null },
  { k: 'subcentro', rotulo: 'Subcentro', w: 110 }, { k: 'fazenda', rotulo: 'Faz.', w: 40 }, { k: 'conta', rotulo: 'Conta', w: 92 },
  { k: 'valor', rotulo: 'Valor', w: 88, direita: true }, { k: 'status', rotulo: 'Status', w: 62 }, { k: null, rotulo: '', w: 112 },
];
const N_COLUNAS = COLUNAS.length;
const LINHAS_A_VISTA = 6;
const ALTURA_LINHA = 17;
const ALTURA_CABECALHO = 20;
/* as fixas + 2 × 120 para Descrição e Fornecedor */
const PISO_DO_QUADRO = COLUNAS.reduce<number>((t, c) => t + (c.w ?? 0), 0) + 240;
const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
const CEL = 'px-[4px] whitespace-nowrap';
const TEXTO = 'px-[4px] truncate';
const SELO_OUTRA = 'inline-block max-w-full truncate rounded-[3px] border border-amber-500 bg-amber-50 px-[3px] text-[8px] font-semibold leading-[12px] text-amber-700';

type Estado =
  | { tipo: 'antes' }
  | { tipo: 'procurando' }
  | { tipo: 'falhou'; motivo: string }
  | { tipo: 'pronto'; termo: string; r: ResultadoDoHistorico };

function paletaDoStatus(k: string) {
  switch (k) {
    case 'previsto': return STATUS_PALETA.previsto;
    case 'programado': return STATUS_PALETA.programado;
    case 'agendado': return STATUS_PALETA.agendado;
    case 'realizado': return STATUS_PALETA.realizado;
    case 'conciliado': return STATUS_PALETA.conciliado;
    default: return null;
  }
}

/* o conciliado DE VERDADE é o vínculo vivo com extrato (`conciliado` da busca): o rótulo é o `conciliado_real` da casa ("Conciliado"),
   nunca o "Conciliado (legado)" do valor gravado na coluna */
function Status({ a }: { a: AchadoDoHistorico }) {
  const k = a.conciliado ? 'conciliado' : (a.status ?? '').trim().toLowerCase();
  const p = paletaDoStatus(k);
  const rotulo = a.conciliado ? STATUS_FILTRO_LABEL.conciliado_real : (STATUS_FILTRO_LABEL[k] ?? (a.status || '—'));
  return <span className={cn('font-semibold', p ? p.texto : 'text-muted-foreground')}>{rotulo}</span>;
}

export function ProcurarNoHistorico({ clienteId, movimento, onCriarIgual, campoRef, onCasar, contaDoExtrato, preencher }: Props) {
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
  const faixa = estado.tipo === 'pronto' ? fraseDaFaixa(estado.termo, estado.r.resumo) : null;
  const frase = faixa ?? (!nomeDoBanco && estado.tipo === 'antes' ? 'o banco não trouxe o nome: digite' : null);
  const contagem = estado.tipo === 'pronto' ? contagemDosAchados(estado.r) : estado.tipo === 'procurando' ? 'procurando…' : '';
  const alturaFixa = ALTURA_CABECALHO + LINHAS_A_VISTA * ALTURA_LINHA + 2;
  /* o cabeçalho só fica PRESO quando o quadro rola de fato (mais linhas que as à vista) — preso num quadro que não rola é vão (P153) */
  const linhasNoQuadro = (frase ? 1 : 0) + (estado.tipo === 'pronto' ? Math.max(1, achados.length) : estado.tipo === 'falhou' ? 1 : 0);

  return (
    <div className={cn('mt-2', preencher && 'flex min-h-0 flex-1 flex-col')} data-testid="procurar-historico">
      {/* a linha do campo: altura fixa, nada quebra */}
      <div className="flex h-[24px] shrink-0 items-center gap-1.5 text-[10px]">
        <span className="shrink-0 font-semibold text-foreground">Procurar no histórico</span>
        <Input ref={campoRef} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="nome do fornecedor ou do banco"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void procurar(); } }}
          className="h-[22px] w-auto min-w-[80px] max-w-[200px] flex-1 px-1.5 text-[10px]" data-testid="procurar-historico-termo" aria-label="Procurar no histórico" />
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
        <span className="ml-auto w-[96px] shrink-0 truncate text-right tabular-nums text-muted-foreground" title={contagem || undefined}
          data-testid="procurar-historico-contagem">{contagem || ' '}</span>
      </div>

      {/* ⚠ o quadro: ALTURA fixa (na estação, cabeçalho + 6 linhas; no modal, o que sobra dele), o vazio fica dentro; o corpo rola aqui */}
      <div className={cn('mt-1 overflow-auto rounded-sm border', preencher && 'min-h-0 flex-1')}
        style={preencher ? { minHeight: alturaFixa } : { height: alturaFixa }} data-testid="procurar-historico-quadro">
        <table className="w-full table-fixed border-collapse text-[9px]" style={{ minWidth: PISO_DO_QUADRO }}>
          <colgroup>{COLUNAS.map((c, i) => <col key={i} style={c.w == null ? undefined : { width: c.w }} />)}</colgroup>
          <thead className={cn('z-10 bg-primary text-primary-foreground', linhasNoQuadro > LINHAS_A_VISTA && 'sticky top-0')}>
            <tr style={{ height: ALTURA_CABECALHO }}>
              {COLUNAS.map((c, i) => {
                const k = c.k;
                const ativa = k != null && ordem.coluna === k;
                const seta = ativa ? (ordem.sentido === 'asc' ? '↑' : '↓') : '';
                return (
                  <th key={i} aria-sort={ativa ? (ordem.sentido === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('px-[4px] text-[8.5px] font-medium whitespace-nowrap', c.direita ? 'text-right' : 'text-left')}>
                    {k ? (
                      <button type="button" onClick={() => setOrdem((o) => proximaOrdem(o, k))}
                        data-testid={`procurar-ordenar-${k}`} title={`Ordenar por ${c.rotulo.replace('.', '')}`}
                        className={cn('inline-flex max-w-full items-center gap-[2px] hover:underline', c.direita && 'justify-end')}>
                        <span className="truncate">{c.rotulo}</span>
                        {/* a seta tem lugar reservado: o cabeçalho não anda ao trocar a ordem */}
                        <span className="inline-block w-[7px] shrink-0 text-center">{seta}</span>
                      </button>
                    ) : c.rotulo}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {frase && (
              <tr style={{ height: ALTURA_LINHA }}>
                <td colSpan={N_COLUNAS} className={cn('truncate px-[4px]', faixa ? 'bg-amber-50 text-amber-800' : 'text-muted-foreground')}
                  title={frase} data-testid="procurar-historico-frase">{frase}</td>
              </tr>
            )}
            {estado.tipo === 'falhou' && (
              <tr style={{ height: ALTURA_LINHA }}>
                <td colSpan={N_COLUNAS} className="truncate px-[4px] text-muted-foreground">
                  Não consegui procurar: {estado.motivo}.{' '}
                  <button type="button" onClick={() => void procurar()} className="font-semibold text-[#1d4ed8] underline underline-offset-2">Tentar de novo</button>
                </td>
              </tr>
            )}
            {estado.tipo === 'pronto' && achados.length === 0 && (
              <tr style={{ height: ALTURA_LINHA }}><td colSpan={N_COLUNAS} className="px-[4px] italic text-muted-foreground">nada achado com "{estado.termo}"</td></tr>
            )}
            {achados.map((a) => {
              const acao = acaoDoAchado(a, contaId, !!onCasar);
              const outra = outraConta(a, contaId);
              const tituloDescricao = [a.descricao, a.banco ? `O banco: ${a.banco}` : null].filter(Boolean).join('\n') || undefined;
              return (
                <tr key={a.lancamentoId} style={{ height: ALTURA_LINHA }} className="border-b border-border/40" data-testid="procurar-historico-achado"
                  data-acao={acao}>
                  <td className={cn(CEL, 'tabular-nums text-muted-foreground')}>{dataBR(a.dataCompetencia)}</td>
                  <td className={cn(CEL, 'tabular-nums text-muted-foreground')}>{dataBR(a.dataVencimento)}</td>
                  <td className={cn(CEL, 'tabular-nums text-muted-foreground')}>{dataBR(a.dataPagamento)}</td>
                  <td className={TEXTO} title={tituloDescricao}>{a.descricao ?? '—'}</td>
                  <td className={TEXTO} title={a.fornecedor ?? undefined}>{a.fornecedor ?? '—'}</td>
                  <td className={TEXTO} title={[a.centro, a.subcentro].filter(Boolean).join(' · ') || undefined}>{a.subcentro ?? '—'}</td>
                  <td className={TEXTO} title={a.fazenda ?? undefined}>{a.fazendaCodigo ?? a.fazenda ?? '—'}</td>
                  <td className={TEXTO} title={outra ? `Conta: ${a.conta ?? '—'} — não é a do extrato (${nomeContaExtrato})` : (a.conta ?? undefined)}>
                    {outra ? <span className={SELO_OUTRA} data-testid="procurar-outra-conta">outra conta</span> : (a.conta ?? '—')}
                  </td>
                  <td className={cn(CEL, 'text-right tabular-nums', corVal(a.valor))}>{fmtBRL(a.valor)}</td>
                  <td className={CEL}><Status a={a} /></td>
                  <td className="px-[4px] text-right">
                    {acao === 'criar_igual' ? (
                      <button type="button" onClick={() => onCriarIgual(modeloDoAchado(a))} data-testid="procurar-criar-igual"
                        className="whitespace-nowrap font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af]">
                        Criar igual
                      </button>
                    ) : (
                      <button type="button" onClick={() => onCasar?.(a, acao === 'casar_trocando_conta')}
                        data-testid={acao === 'casar' ? 'procurar-casar' : 'procurar-casar-trocando'}
                        title={acao === 'casar' ? 'Casar com o movimento do banco' : `Casar e trocar a conta para ${nomeContaExtrato}`}
                        className="whitespace-nowrap font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af]">
                        {acao === 'casar' ? 'Casar' : 'Casar e trocar conta'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

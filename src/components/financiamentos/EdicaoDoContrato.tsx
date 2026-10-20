/**
 * FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 (Gabriel 18/10/2026) — as peças da edição do contrato de crédito:
 *  · `RegerarParcelas`: "Regerar parcelas em aberto" — pergunta "Manter ajustes" (padrão) ou "Recalcular todas", mostra a PRÉVIA do
 *    banco (antes × depois, a base a partir do saldo da fonte única) e só grava na confirmação;
 *  · `EditarParcelasDialog`: a edição à mão das parcelas em aberto (vencimento, principal, juros; acrescentar e retirar), sempre
 *    liberada; a paga, a com pagamento registrado e a vinculada ficam em leitura com o motivo; a ajustada leva o selo; a diferença do
 *    principal em aberto contra o saldo aparece em laranja e nunca é forçada; "Desfazer a última alteração".
 * ⚠ SÓ DESENHA: a prévia e a gravação são a MESMA RPC (simular = gravar desfeito); nenhuma conta de dinheiro aqui.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { Segmentado } from '@/components/ui/segmentado';
import { BLOCO_FORMULARIO, CORPO_FORMULARIO, REGUA_CAMPO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import type { ModoDeRegerar, UltimaOperacao, useEdicaoDoContrato } from '@/hooks/useEdicaoDoContrato';
import {
  antesDepois, contaAntesDepois, contaDoCronograma, diferencaDaLinha, diferencaDoSaldo, fraseDaDiferenca, fraseDaRecusaDoRegerar, lerBase, lerFoto,
  mudancasDasParcelas, rotuloDaLinha, semMudanca, textoDaBase, totalDaLinha,
  type CampoNaoCadastrado, type FotoDaParcela, type ParcelaParaEditar, type RespostaDoBanco,
} from '@/lib/financiamentos/edicaoDoContrato';

type Api = ReturnType<typeof useEdicaoDoContrato>;
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LARANJA = 'text-amber-700';
export const SeloAjustada = () => (
  <span className="rounded-full bg-amber-100 px-1.5 text-[9.5px] font-medium leading-[13px] text-amber-800" data-testid="selo-ajustada"
    title="parcela ajustada à mão: o regerar com &quot;Manter ajustes&quot; não a toca">ajustada</span>
);

/* ═══ FIN-CONTRATO-CRONOGRAMA-01 — A TABELA DO CRONOGRAMA, UMA SÓ ═════════════════════════════════════════════════════════════
   Usada pela aba "Condições e cronograma" do cadastro e pelo "Editar parcelas" da tela do contrato. Dois modos:
    · editar: Nº · Vencimento · Pagamento · Principal · Juros · Total · Saldo após · Situação · ✕ — a paga / vinculada fica cinza, sem
      campo e sem ✕; a em aberto se edita na linha (campos de 18px, `CampoMoeda`); o selo "ajustada" mora num lugar próprio da célula
      Situação, nunca sobre data ou número;
    · antes-depois: a prévia do Regerar, com as colunas antes e depois e a diferença.
   Cabeçalho navy preso; rodapé de total preso, com outro fundo. Só a tabela rola (os dois eixos), dentro do cartão.
   ⚠ SÓ DESENHA: as somas do rodapé e o "saldo após" são do dono puro (`contaDoCronograma`, `contaAntesDepois`), em centavos. */
const TH_C = 'sticky top-0 z-10 h-[22px] bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground whitespace-nowrap';
const TD_C = 'h-[22px] border-b border-border/60 px-1.5 py-0 text-[11px] leading-[18px] whitespace-nowrap tabular-nums';
const TF_C = 'sticky bottom-0 z-10 h-[22px] border-t border-border bg-[#e3e8ef] px-1.5 py-0 text-[11px] font-semibold whitespace-nowrap tabular-nums text-foreground';
const CAMPO_LINHA = 'h-[18px] text-[11px]';
const brLonga = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
/** a régua da tabela de edição (px): o pior texto medido + o padding; quem mexe mede de novo */
export const REGUA_DO_CRONOGRAMA = { numero: 34, vencimento: 112, pagamento: 78, principal: 132, juros: 128, total: 116, saldo: 116, situacao: 136, retirar: 22 } as const;
export const REGUA_ANTES_DEPOIS = { numero: 34, vencimento: 84, principal: 112, juros: 104, principalDepois: 112, jurosDepois: 104, diferenca: 104, selo: 64 } as const;
const somaRegua = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

type PropsDoCronograma =
  | { modo: 'editar'; linhas: readonly ParcelaParaEditar[]; contratado: number | null; editavel: boolean;
      onMudar?: (i: number, p: Partial<ParcelaParaEditar>) => void; onRetirar?: (i: number) => void; focoId?: string | null;
      /** a frase da tabela vazia */ vazio?: string; testId?: string }
  | { modo: 'antes-depois'; antes: readonly FotoDaParcela[]; depois: readonly FotoDaParcela[] };

export function TabelaDoCronograma(props: PropsDoCronograma) {
  if (props.modo === 'antes-depois') return <TabelaAntesDepois antes={props.antes} depois={props.depois} />;
  const { linhas, contratado, editavel, onMudar, onRetirar, focoId, vazio, testId } = props;
  const conta = contaDoCronograma(linhas, contratado);
  const R = REGUA_DO_CRONOGRAMA;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card" data-testid={testId ?? 'tabela-do-cronograma'}>
      <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: somaRegua(R) }}>
        <colgroup>{Object.values(R).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr>
          {['Nº', 'Vencimento', 'Pagamento', 'Principal', 'Juros', 'Total', 'Saldo após', 'Situação', ''].map((h, i) => (
            <th key={i} className={`${TH_C} ${i >= 3 && i <= 6 ? 'text-right' : i === 0 ? 'text-center' : 'text-left'}`}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {linhas.map((l, i) => {
            const travada = !!l.trava;
            const campo = editavel && !travada;
            const total = totalDaLinha(l);
            const saldo = conta.saldoApos[i];
            return (
              <tr key={l.id ?? `nova-${i}`} data-testid="linha-editar-parcela" title={l.trava ?? undefined}
                className={`${travada ? 'bg-muted/70 text-muted-foreground' : ''} ${l.id !== null && l.id === focoId ? 'bg-primary/5' : ''}`}>
                <td className={`${TD_C} text-center`}>{l.numero ?? '—'}</td>
                <td className={`${TD_C} ${campo ? '!px-0.5' : ''}`}>
                  {campo ? <DatePicker size="compact" className={CAMPO_LINHA} value={l.vencimento ?? ''} onChange={(v) => onMudar?.(i, { vencimento: v || null })} />
                    : brLonga(l.vencimento)}
                </td>
                <td className={TD_C}>{brLonga(l.pagoEm)}</td>
                <td className={`${TD_C} text-right ${campo ? '!px-0.5' : ''}`}>
                  {campo ? <CampoMoeda className={CAMPO_LINHA} valor={l.principal} onChange={(v) => onMudar?.(i, { principal: v ?? 0 })} /> : num2(l.principal)}
                </td>
                <td className={`${TD_C} text-right ${campo ? '!px-0.5' : ''}`}>
                  {campo ? <CampoMoeda className={CAMPO_LINHA} valor={l.juros} onChange={(v) => onMudar?.(i, { juros: v ?? 0 })} /> : num2(l.juros)}
                </td>
                <td className={`${TD_C} text-right`}>{num2(total)}</td>
                <td className={`${TD_C} text-right`}>{saldo === null ? '—' : num2(saldo)}</td>
                <td className={TD_C}>
                  <span className="flex items-center gap-1">
                    <span className={`min-w-0 flex-1 ${l.situacao === 'paga' ? 'text-[#15803d]' : l.situacao === 'vencida' ? 'text-[#b91c1c]' : ''}`}
                      data-testid={travada ? 'trava-da-parcela' : 'situacao-da-parcela'} title={l.trava ?? undefined}>{rotuloDaLinha(l)}</span>
                    {/* o lugar do selo existe sempre: aparecer ou não nunca empurra a situação */}
                    <span className="inline-flex w-[50px] shrink-0 justify-end">{l.ajustada && <SeloAjustada />}</span>
                  </span>
                </td>
                <td className={`${TD_C} text-center`}>
                  {campo && onRetirar && <button type="button" className="text-muted-foreground hover:text-destructive" title="Retirar a parcela" data-testid="retirar-parcela"
                    onClick={() => onRetirar(i)}><X className="size-3" /></button>}
                </td>
              </tr>
            );
          })}
          {linhas.length === 0 && <tr><td colSpan={9} className={`${TD_C} text-muted-foreground`}>{vazio ?? 'Sem parcelas.'}</td></tr>}
        </tbody>
        <tfoot><tr data-testid="total-do-cronograma">
          <td className={TF_C} /><td className={TF_C}>Total</td><td className={TF_C} />
          <td className={`${TF_C} text-right`}>{num2(conta.principal)}</td>
          <td className={`${TF_C} text-right`}>{num2(conta.juros)}</td>
          <td className={`${TF_C} text-right`}>{num2(conta.total)}</td>
          <td className={TF_C} />
          <td className={TF_C}>{conta.pagas} de {conta.parcelas} {conta.pagas === 1 ? 'paga' : 'pagas'}</td>
          <td className={TF_C} />
        </tr></tfoot>
      </table>
    </div>
  );
}

/* ═══ ANTES × DEPOIS ═════════════════════════════════════════════════════════════════════════════════════════════════════ */
function TabelaAntesDepois({ antes, depois }: { antes: readonly FotoDaParcela[]; depois: readonly FotoDaParcela[] }) {
  const linhas = antesDepois(antes, depois);
  const conta = contaAntesDepois(linhas);
  const R = REGUA_ANTES_DEPOIS;
  const ANT = '!bg-[#55657d]';
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card" data-testid="antes-depois">
      <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: somaRegua(R) }}>
        <colgroup>{Object.values(R).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr>
          <th className={`${TH_C} text-center`}>Nº</th><th className={`${TH_C} text-left`}>Vencimento</th>
          <th className={`${TH_C} ${ANT} text-right`}>Principal antes</th><th className={`${TH_C} ${ANT} text-right`}>Juros antes</th>
          <th className={`${TH_C} text-right`}>Principal depois</th><th className={`${TH_C} text-right`}>Juros depois</th>
          <th className={`${TH_C} text-right`}>Diferença</th><th className={TH_C} />
        </tr></thead>
        <tbody>
          {linhas.map((l) => {
            const paga = (l.antes?.status ?? l.depois?.status) === 'pago';
            const dif = diferencaDaLinha(l);
            const venc = l.depois?.vencimento ?? l.antes?.vencimento ?? null;
            const mudouVenc = !!l.antes && !!l.depois && l.antes.vencimento !== l.depois.vencimento;
            return (
              <tr key={l.id} data-testid="linha-antes-depois" data-marca={l.marca} className={paga ? 'bg-muted/70 text-muted-foreground' : ''}>
                <td className={`${TD_C} text-center`}>{l.depois?.numero ?? l.antes?.numero ?? '—'}</td>
                <td className={`${TD_C} ${mudouVenc ? 'font-semibold text-amber-700' : ''}`} title={mudouVenc ? `antes: ${brLonga(l.antes?.vencimento)}` : undefined}>{brLonga(venc)}</td>
                <td className={`${TD_C} text-right`}>{l.antes ? num2(l.antes.principal) : '—'}</td>
                <td className={`${TD_C} text-right`}>{l.antes ? num2(l.antes.juros) : '—'}</td>
                <td className={`${TD_C} text-right ${l.marca === 'mudou' ? 'font-semibold' : ''}`}>{l.depois ? num2(l.depois.principal) : '—'}</td>
                <td className={`${TD_C} text-right ${l.marca === 'mudou' ? 'font-semibold' : ''}`}>{l.depois ? num2(l.depois.juros) : '—'}</td>
                <td className={`${TD_C} text-right ${l.marca === 'retirada' ? 'text-[#b91c1c]' : l.marca === 'nova' ? 'text-[#15803d]' : dif !== null && Math.round(dif * 100) !== 0 ? 'font-semibold text-amber-700' : ''}`}>
                  {l.marca === 'retirada' ? 'sai' : l.marca === 'nova' ? 'nova' : dif !== null && Math.round(dif * 100) !== 0 ? sinal2(dif) : paga ? 'paga · fica' : 'fica'}
                </td>
                <td className={`${TD_C} text-right`}>{l.depois?.ajustada && <SeloAjustada />}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr data-testid="total-antes-depois">
          <td className={TF_C} /><td className={TF_C}>Total</td>
          <td className={`${TF_C} text-right`}>{num2(conta.antesPrincipal)}</td><td className={`${TF_C} text-right`}>{num2(conta.antesJuros)}</td>
          <td className={`${TF_C} text-right`}>{num2(conta.depoisPrincipal)}</td><td className={`${TF_C} text-right`}>{num2(conta.depoisJuros)}</td>
          <td className={`${TF_C} text-right ${Math.round(conta.diferenca * 100) !== 0 ? 'text-amber-700' : ''}`}>{sinal2(conta.diferenca)}</td><td className={TF_C} />
        </tr></tfoot>
      </table>
    </div>
  );
}
const sinal2 = (v: number) => (Math.round(v * 100) === 0 ? '0,00' : `${v > 0 ? '+' : '−'}${num2(Math.abs(v))}`);

/* ═══ REGERAR PARCELAS EM ABERTO — no lugar da tabela ══════════════════════════════════════════════════════════════════════
   FIN-CONTRATO-CRONOGRAMA-01: a faixa de 24px "Regerar Y em aberto · <sistema> · as X pagas ficam" + [Manter ajustes | Recalcular todas]
   + Voltar + "Regerar e gravar", e a tabela vira o antes × depois com o mesmo rodapé de total. A seção própria (flex-1) saiu. */
export function RegerarParcelas({ api, onFeito, onVoltar, onCampoFaltando, ajustadasEmAberto = 0 }: { api: Api; onFeito: (r: RespostaDoBanco) => void; onVoltar?: () => void;
  /** FIN-CONTRATO-NC-SALVAR-01 — a recusa por campo não cadastrado diz qual campo destacar no cabeçalho */
  onCampoFaltando?: (campo: CampoNaoCadastrado) => void;
  /** quantas parcelas em aberto estão ajustadas à mão — explica o "Manter ajustes" que não tem o que regerar */
  ajustadasEmAberto?: number }) {
  const [modo, setModo] = useState<ModoDeRegerar>('manter_ajustes');
  const [previa, setPrevia] = useState<RespostaDoBanco | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { regerar } = api;
  useEffect(() => {
    let vivo = true; setPrevia(null); setErro(null);
    void regerar(modo, true).then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [modo]); // eslint-disable-line react-hooks/exhaustive-deps -- a prévia depende só do modo (a função muda a cada render do hook)
  const antes = previa ? lerFoto(previa.corpo.antes) : null;
  const depois = previa ? lerFoto(previa.corpo.depois) : null;
  const base = previa ? lerBase(previa.corpo) : null;
  const recusa = previa?.recusa ? fraseDaRecusaDoRegerar(previa.recusa, { modo, ajustadasEmAberto }) : null;
  useEffect(() => { if (recusa?.campo && onCampoFaltando) onCampoFaltando(recusa.campo); }, [recusa?.campo]); // eslint-disable-line react-hooks/exhaustive-deps -- avisa uma vez por recusa
  const dif = previa ? fraseDaDiferenca(diferencaDoSaldo(previa.corpo)) : null;
  const ficam = antes ? antes.filter((a) => a.status === 'pago').length : 0;
  const gravar = async () => {
    setGravando(true); setErro(null);
    const r = await regerar(modo, false);
    setGravando(false);
    if (r.recusa) { setErro(r.recusa); return; }
    onFeito(r);
  };
  const titulo = base ? `o que o BANCO vai usar: saldo R$ ${num2(base.saldo)} · fica R$ ${num2(base.guardado)} · regera R$ ${num2(base.principal)} em ${base.parcelas} parcela(s)` : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="regerar-parcelas">
      <div className="flex h-[24px] shrink-0 items-center gap-2 text-[11px]">
        <span className="uma-linha-que-rola min-w-0 flex-1" data-testid="base-do-regerar" title={erro ?? recusa?.frase ?? titulo}>
          {erro ? <span className="text-[#b91c1c]" data-testid="erro-do-regerar">{erro}</span>
            : previa === null ? <span className="text-muted-foreground">lendo a prévia do banco</span>
            : recusa ? <span className={recusa.semNada ? 'font-medium text-amber-800' : 'text-[#b91c1c]'} data-testid="recusa-do-regerar">{recusa.frase}</span>
            : base ? <>Regerar {base.parcelas} em aberto · <span data-testid="texto-da-base">{textoDaBase(base)}</span> · {ficam === 1 ? 'a 1 paga fica' : `as ${ficam} pagas ficam`}
                {dif && <span className={LARANJA} data-testid="diferenca-do-saldo"> · {dif}</span>}</> : null}
        </span>
        <Segmentado<ModoDeRegerar> altura={22} valor={modo} onEscolher={setModo} opcoes={[
          { valor: 'manter_ajustes', rotulo: 'Manter ajustes', title: 'as parcelas ajustadas à mão também ficam' },
          { valor: 'recalcular_todas', rotulo: 'Recalcular todas', title: 'as ajustadas também são substituídas' },
        ]} />
        {onVoltar && <Button variant="outline" size="sm" className="h-[22px] shrink-0 text-[10px]" onClick={onVoltar} data-testid="voltar-do-regerar">Voltar</Button>}
        <Button size="sm" className="h-[22px] shrink-0 bg-[#e8b53f] text-[10px] text-[#1f2937] hover:bg-[#d9a632]" disabled={gravando || !previa || !!previa.recusa}
          onClick={() => void gravar()} data-testid="confirmar-regerar">
          {gravando ? 'Regerando' : 'Regerar e gravar'}
        </Button>
      </div>
      {antes && depois ? <TabelaDoCronograma modo="antes-depois" antes={antes} depois={depois} />
        : <div className="min-h-0 flex-1 rounded-md border bg-card" />}
    </div>
  );
}

/* ═══ EDITAR PARCELAS (à mão) ═══════════════════════════════════════════════════════════════════════════════════════════ */
export type { ParcelaParaEditar };

export function EditarParcelasDialog({ aberto, aoFechar, parcelas, api, ultimaOperacao, focoId, contratado = null }: {
  aberto: boolean; aoFechar: () => void; parcelas: readonly ParcelaParaEditar[]; api: Api; ultimaOperacao: UltimaOperacao | null; focoId?: string | null;
  /** o valor contratado: o "saldo após" de cada linha (sem ele, "—") */ contratado?: number | null;
}) {
  const originais = useMemo(() => parcelas.map((p) => ({ id: p.id, vencimento: p.vencimento, principal: p.principal, juros: p.juros })), [parcelas]);
  const [linhas, setLinhas] = useState<ParcelaParaEditar[]>(() => [...parcelas]);
  const [vista, setVista] = useState<'editar' | 'regerar' | 'desfazer'>('editar');
  const [previa, setPrevia] = useState<RespostaDoBanco | null>(null);
  const [gravando, setGravando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  useEffect(() => { setLinhas([...parcelas]); }, [parcelas]);
  const mudancas = useMemo(() => mudancasDasParcelas(originais, linhas.map((l) => ({ id: l.id, vencimento: l.vencimento, principal: l.principal, juros: l.juros }))), [originais, linhas]);
  const chave = JSON.stringify(mudancas);
  const { editarParcelas, desfazer } = api;
  useEffect(() => {
    if (semMudanca(mudancas)) { setPrevia(null); return; }
    let vivo = true;
    const tm = setTimeout(() => { void editarParcelas(mudancas, true).then((r) => { if (vivo) setPrevia(r); }); }, 350);
    return () => { vivo = false; clearTimeout(tm); };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps -- a prévia depende só das mudanças
  const mudar = (i: number, p: Partial<ParcelaParaEditar>) => { setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p, ajustada: true } : l))); setRecado(null); };
  const gravar = async () => {
    setGravando(true); setRecado(null);
    const r = await editarParcelas(mudancas, false);
    setGravando(false);
    if (r.recusa) { setRecado(r.recusa); return; }
    aoFechar();
  };
  const gravarDesfazer = async () => {
    if (!ultimaOperacao) return;
    if (!motivo.trim()) { setRecado('Informe o motivo para desfazer.'); return; }
    setGravando(true);
    const r = await desfazer(ultimaOperacao.id, motivo, false);
    setGravando(false);
    if (r.recusa) { setRecado(r.recusa); return; }
    aoFechar();
  };
  const dif = previa && !previa.recusa ? fraseDaDiferenca(diferencaDoSaldo(previa.corpo)) : null;
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(900px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="editar-parcelas-dialog">
        <div className="flex h-[34px] shrink-0 items-center gap-3 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">Editar parcelas</DialogTitle>
          <DialogDescription className="sr-only">Editar as parcelas em aberto do contrato</DialogDescription>
        </div>
        <div className="flex h-[32px] shrink-0 items-center gap-2 border-b px-3">
          <Segmentado altura={22} valor={vista} onEscolher={setVista} opcoes={[
            { valor: 'editar', rotulo: 'À mão' }, { valor: 'regerar', rotulo: 'Regerar em aberto' },
            { valor: 'desfazer', rotulo: 'Desfazer a última', desabilitada: !ultimaOperacao, title: ultimaOperacao ? undefined : 'nenhuma alteração para desfazer' },
          ]} />
        </div>
        <div className={`${CORPO_FORMULARIO} min-h-0 flex-1`} data-testid="corpo-editar-parcelas">
          {vista === 'regerar' && <RegerarParcelas api={api} onFeito={() => aoFechar()} onVoltar={() => setVista('editar')}
            ajustadasEmAberto={linhas.filter((l) => l.ajustada && !l.trava).length} />}
          {vista === 'desfazer' && (
            <section className={BLOCO_FORMULARIO} data-testid="desfazer-parcelas">
              <TituloDoBloco nome="Desfazer a última alteração das parcelas" />
              <p className="text-[11px]">{ultimaOperacao ? `Volta as parcelas ao que eram antes da última ${ultimaOperacao.tipo === 'regerar' ? 'regeração' : 'edição'}; o motor refaz os lançamentos. Parcela paga ou vinculada depois impede.` : 'Nada a desfazer.'}</p>
              <div className="mt-1.5 grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Motivo *</span>
                <Input className={REGUA_CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-desfazer" />
              </div>
            </section>
          )}
          {vista === 'editar' && (
            <section className={`${BLOCO_FORMULARIO} flex min-h-0 flex-1 flex-col`} data-testid="parcelas-a-mao">
              <TituloDoBloco nome="Parcelas" dica="edição à mão sempre liberada · pagas e vinculadas não mudam"
                acao={<Button variant="outline" size="sm" className="h-[20px] gap-1 px-2 text-[10px]" data-testid="acrescentar-parcela"
                  onClick={() => setLinhas((ls) => [...ls, { id: null, numero: null, vencimento: null, principal: 0, juros: 0, ajustada: true, trava: null, situacao: null, pagoEm: null }])}>
                  <Plus className="size-3" /> parcela</Button>} />
              <TabelaDoCronograma modo="editar" linhas={linhas} contratado={contratado} editavel focoId={focoId}
                onMudar={mudar} onRetirar={(i) => setLinhas((ls) => ls.filter((_x, j) => j !== i))} />
            </section>
          )}
        </div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t px-3">
          <span className="min-w-0 flex-1 truncate text-[10px]" data-testid="recado-editar-parcelas"
            title={recado ?? previa?.recusa ?? dif ?? undefined}>
            {recado ? <span className="text-[#b91c1c]">{recado}</span>
              : vista === 'editar' && previa?.recusa ? <span className="text-[#b91c1c]">{previa.recusa}</span>
              : vista === 'editar' && dif ? <span className={LARANJA} data-testid="diferenca-editar">{dif}</span>
              : vista === 'editar' && semMudanca(mudancas) ? <span className="text-muted-foreground">nenhuma mudança</span> : ''}
          </span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
          {vista === 'editar' && <Button size="sm" className="h-[24px] text-[10px]" data-testid="salvar-parcelas"
            disabled={gravando || semMudanca(mudancas) || !!previa?.recusa} onClick={() => void gravar()}>{gravando ? 'Gravando…' : 'Salvar parcelas'}</Button>}
          {vista === 'desfazer' && <Button size="sm" className="h-[24px] text-[10px]" data-testid="confirmar-desfazer"
            disabled={gravando || !ultimaOperacao} onClick={() => void gravarDesfazer()}>{gravando ? 'Desfazendo…' : 'Desfazer'}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

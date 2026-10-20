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
  antesDepois, diferencaDoSaldo, fraseDaDiferenca, fraseDaRecusaDoRegerar, lerBase, lerFoto, mudancasDasParcelas, semMudanca, textoDaBase,
  type CampoNaoCadastrado, type FotoDaParcela, type ParcelaEditavel, type RespostaDoBanco,
} from '@/lib/financiamentos/edicaoDoContrato';

type Api = ReturnType<typeof useEdicaoDoContrato>;
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const TH = 'sticky top-0 z-10 h-[22px] bg-primary px-2 text-[9.5px] font-semibold text-primary-foreground whitespace-nowrap';
const TD = 'h-[22px] px-2 text-[10.5px] whitespace-nowrap tabular-nums';
const LARANJA = 'text-amber-700';
export const SeloAjustada = () => (
  <span className="rounded-full bg-amber-100 px-1.5 text-[9px] font-medium leading-[13px] text-amber-800" data-testid="selo-ajustada"
    title="parcela ajustada à mão: o regerar com &quot;Manter ajustes&quot; não a toca">ajustada</span>
);

/* ═══ ANTES × DEPOIS ═════════════════════════════════════════════════════════════════════════════════════════════════════ */
const MARCA: Record<string, { texto: string; tom: string }> = {
  igual: { texto: 'fica', tom: 'text-muted-foreground' }, mudou: { texto: 'muda', tom: LARANJA },
  nova: { texto: 'nova', tom: 'text-[#15803d]' }, retirada: { texto: 'sai', tom: 'text-[#b91c1c]' },
};
export function TabelaAntesDepois({ antes, depois }: { antes: readonly FotoDaParcela[]; depois: readonly FotoDaParcela[] }) {
  const linhas = antesDepois(antes, depois);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card" data-testid="antes-depois">
      <table className="w-full table-fixed border-collapse">
        <colgroup><col style={{ width: 44 }} /><col style={{ width: 70 }} /><col /><col /><col style={{ width: 8 }} /><col style={{ width: 70 }} /><col /><col /><col style={{ width: 56 }} /></colgroup>
        <thead><tr>
          {['Nº', 'Venc.', 'Principal', 'Juros', '', 'Venc.', 'Principal', 'Juros', ''].map((h, i) => (
            <th key={i} className={`${TH} ${i === 2 || i === 3 || i === 6 || i === 7 ? 'text-right' : 'text-left'}`}>{i === 1 ? 'Antes · venc.' : i === 5 ? 'Depois · venc.' : h}</th>
          ))}
        </tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b" data-testid="linha-antes-depois" data-marca={l.marca}>
              <td className={TD}>{l.depois?.numero ?? l.antes?.numero ?? '—'}{l.depois?.ajustada && <> <SeloAjustada /></>}</td>
              <td className={TD}>{br(l.antes?.vencimento ?? null)}</td>
              <td className={`${TD} text-right`}>{l.antes ? num2(l.antes.principal) : '—'}</td>
              <td className={`${TD} text-right`}>{l.antes ? num2(l.antes.juros) : '—'}</td>
              <td />
              <td className={TD}>{br(l.depois?.vencimento ?? null)}</td>
              <td className={`${TD} text-right ${l.marca === 'mudou' ? 'font-semibold' : ''}`}>{l.depois ? num2(l.depois.principal) : '—'}</td>
              <td className={`${TD} text-right ${l.marca === 'mudou' ? 'font-semibold' : ''}`}>{l.depois ? num2(l.depois.juros) : '—'}</td>
              <td className={`${TD} ${MARCA[l.marca].tom}`}>{MARCA[l.marca].texto}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══ REGERAR PARCELAS EM ABERTO ═══════════════════════════════════════════════════════════════════════════════════════ */
export function RegerarParcelas({ api, onFeito, onVoltar, onCampoFaltando }: { api: Api; onFeito: (r: RespostaDoBanco) => void; onVoltar?: () => void;
  /** FIN-CONTRATO-NC-SALVAR-01 — a recusa por campo não cadastrado diz qual campo destacar no cabeçalho */
  onCampoFaltando?: (campo: CampoNaoCadastrado) => void }) {
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
  const recusa = previa?.recusa ? fraseDaRecusaDoRegerar(previa.recusa) : null;
  useEffect(() => { if (recusa?.campo && onCampoFaltando) onCampoFaltando(recusa.campo); }, [recusa?.campo]); // eslint-disable-line react-hooks/exhaustive-deps -- avisa uma vez por recusa
  const dif = previa ? fraseDaDiferenca(diferencaDoSaldo(previa.corpo)) : null;
  const gravar = async () => {
    setGravando(true); setErro(null);
    const r = await regerar(modo, false);
    setGravando(false);
    if (r.recusa) { setErro(r.recusa); return; }
    onFeito(r);
  };
  return (
    <section className={`${BLOCO_FORMULARIO} flex min-h-0 flex-1 flex-col`} data-testid="regerar-parcelas">
      <TituloDoBloco nome="Regerar parcelas em aberto" dica="pagas e vinculadas ficam intactas"
        acao={<Segmentado<ModoDeRegerar> altura={20} valor={modo} onEscolher={setModo} opcoes={[
          { valor: 'manter_ajustes', rotulo: 'Manter ajustes', title: 'as parcelas ajustadas à mão também ficam' },
          { valor: 'recalcular_todas', rotulo: 'Recalcular todas', title: 'as ajustadas também são substituídas' },
        ]} />} />
      <div className="mb-1 flex h-[18px] shrink-0 items-center gap-3 text-[10.5px]" data-testid="base-do-regerar">
        {previa === null ? <span className="text-muted-foreground">lendo a prévia do banco…</span>
          : recusa ? <span className="uma-linha-que-rola min-w-0 text-[#b91c1c]" title={recusa.frase} data-testid="recusa-do-regerar">{recusa.frase}</span>
          : base ? <span className="uma-linha-que-rola min-w-0 text-muted-foreground" data-testid="texto-da-base"
              title="o que o BANCO vai usar: o contrato gravado · a base é o saldo devedor da fonte única menos o principal das parcelas que ficam">
              saldo R$ {num2(base.saldo)} · fica R$ {num2(base.guardado)} · regera R$ {num2(base.principal)} em {base.parcelas} parcela(s) · {textoDaBase(base)}
            </span> : null}
        {dif && <span className={`ml-auto shrink-0 ${LARANJA}`} data-testid="diferenca-do-saldo">{dif}</span>}
      </div>
      {antes && depois ? <TabelaAntesDepois antes={antes} depois={depois} /> : <div className="min-h-0 flex-1" />}
      <div className="mt-1.5 flex h-[24px] shrink-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10px] text-[#b91c1c]" title={erro ?? undefined} data-testid="erro-do-regerar">{erro ?? ''}</span>
        {onVoltar && <Button variant="outline" size="sm" className="h-[22px] text-[10px]" onClick={onVoltar}>Voltar</Button>}
        <Button size="sm" className="h-[22px] text-[10px]" disabled={gravando || !previa || !!previa.recusa} onClick={() => void gravar()} data-testid="confirmar-regerar">
          {gravando ? 'Regerando…' : 'Regerar e gravar'}
        </Button>
      </div>
    </section>
  );
}

/* ═══ EDITAR PARCELAS (à mão) ═══════════════════════════════════════════════════════════════════════════════════════════ */
export interface ParcelaParaEditar extends ParcelaEditavel { numero: number | null; ajustada: boolean; trava: string | null }

export function EditarParcelasDialog({ aberto, aoFechar, parcelas, api, ultimaOperacao, focoId }: {
  aberto: boolean; aoFechar: () => void; parcelas: readonly ParcelaParaEditar[]; api: Api; ultimaOperacao: UltimaOperacao | null; focoId?: string | null;
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
        <div className={`${CORPO_FORMULARIO} min-h-0 flex-1`}>
          {vista === 'regerar' && <RegerarParcelas api={api} onFeito={() => aoFechar()} onVoltar={() => setVista('editar')} />}
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
                  onClick={() => setLinhas((ls) => [...ls, { id: null, numero: null, vencimento: null, principal: 0, juros: 0, ajustada: true, trava: null }])}>
                  <Plus className="size-3" /> parcela</Button>} />
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card">
                <table className="w-full table-fixed border-collapse">
                  <colgroup><col style={{ width: 70 }} /><col style={{ width: 130 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col /><col style={{ width: 28 }} /></colgroup>
                  <thead><tr>{['Nº', 'Vencimento', 'Principal', 'Juros', 'Situação', ''].map((h, i) => <th key={i} className={`${TH} ${i === 2 || i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={l.id ?? `nova-${i}`} className={`border-b ${l.id === focoId ? 'bg-primary/5' : ''}`} data-testid="linha-editar-parcela">
                        <td className={TD}>{l.numero ?? 'nova'}{l.ajustada && <> <SeloAjustada /></>}</td>
                        {l.trava ? (<>
                          <td className={TD}>{br(l.vencimento)}</td><td className={`${TD} text-right`}>{num2(l.principal)}</td><td className={`${TD} text-right`}>{num2(l.juros)}</td>
                          <td className={`${TD} truncate text-muted-foreground`} title={l.trava} data-testid="trava-da-parcela">{l.trava}</td><td />
                        </>) : (<>
                          <td className="px-1"><DatePicker size="compact" className={REGUA_CAMPO} value={l.vencimento ?? ''} onChange={(v) => mudar(i, { vencimento: v || null })} /></td>
                          <td className="px-1"><CampoMoeda className={REGUA_CAMPO} valor={l.principal} onChange={(v) => mudar(i, { principal: v ?? 0 })} /></td>
                          <td className="px-1"><CampoMoeda className={REGUA_CAMPO} valor={l.juros} onChange={(v) => mudar(i, { juros: v ?? 0 })} /></td>
                          <td className={`${TD} text-muted-foreground`}>em aberto</td>
                          <td><button type="button" className="text-muted-foreground hover:text-destructive" title="Retirar a parcela" data-testid="retirar-parcela"
                            onClick={() => setLinhas((ls) => ls.filter((_x, j) => j !== i))}><X className="size-3" /></button></td>
                        </>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

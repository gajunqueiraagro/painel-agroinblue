/**
 * FIN-FINANC-28 · PASSO 6 — no modal do Financeiro, o lançamento e o financiamento: se ele já está num contrato (parcela, liberação,
 * encargo, captação), o rodapé diz qual e abre a tela dele (e oferece o gesto contrário quando ele se desfaz por aqui); se não está,
 * "Vincular a financiamento" abre o diálogo com as abas Parcela · Liberação · Encargo · Criar contrato — as candidatas são as do
 * motor do 4b, perguntado ao contrário (`fn_lancamento_financiamento`). O banco decide; a tela só lê, simula e confirma.
 *
 * ⚠ DIÁLOGO DE TAMANHO FIXO (780 × 440), um scrollport (a lista), régua `table-fixed` em px, a prévia num lugar reservado de 30px.
 */
import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Segmentado } from '@/components/ui/segmentado';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RemoverDialog } from '@/components/financiamentos/ContratoDeCredito';
import { CadastroDeContratoDialog } from '@/components/financiamentos/CadastroDeContratoDialog';
import { useLancamentoNoFinanciamento, type EncargoDoLancamento } from '@/hooks/useLancamentoNoFinanciamento';
import {
  PAPEIS, ROTULO_DO_PAPEL, desfazivelPorAqui, fraseDoOndeEsta, fraseDoOutro,
  type LancamentoNoFinanciamento, type LiberacaoCandidata, type PapelDoPagamento, type ParcelaCandidata, type ResultadoDoVinculo,
} from '@/lib/financiamentos/buscaNoContrato';

type Aba = 'parcela' | 'liberacao' | 'encargo' | 'criar';
type PapelDoEncargo = 'juros' | 'iof' | 'tarifa' | 'seguro' | 'multa' | 'outro';
const PAPEIS_DO_ENCARGO: readonly PapelDoEncargo[] = ['juros', 'iof', 'tarifa', 'seguro', 'multa', 'outro'];
export const MOTIVO_CRIAR_CONTRATO_DEPOIS = 'O formulário novo do contrato (passo 7) abre daqui, pré-preenchido com este lançamento.';

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const TH = 'sticky top-0 z-10 h-[22px] bg-primary px-2 text-left text-[9.5px] font-semibold text-primary-foreground whitespace-nowrap overflow-hidden text-ellipsis';
const TD = 'h-[22px] px-2 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis';

/** o pedaço do rodapé do modal: onde o lançamento está, ou o botão de vincular */
export function FinanciamentoDoLancamento({ lancamentoId, clienteId, onAbrirContrato, onCriarContrato }: {
  lancamentoId: string; clienteId: string; onAbrirContrato?: (financiamentoId: string) => void;
  onCriarContrato?: (l: LancamentoNoFinanciamento) => void;
}) {
  const api = useLancamentoNoFinanciamento(lancamentoId, clienteId);
  const [aberto, setAberto] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  /* passo 7: "Criar contrato" abre o cadastro novo já com a data e o valor deste lançamento */
  const [criando, setCriando] = useState<LancamentoNoFinanciamento | null>(null);
  const d = typeof api.dado === 'object' ? api.dado : null;
  if (!d) return null;
  if (d.atual) {
    const a = d.atual;
    return (
      <span className="flex min-w-0 items-center gap-1 text-[10px]" data-testid="financiamento-do-lancamento">
        <button type="button" className="min-w-0 truncate font-medium text-primary hover:underline disabled:no-underline disabled:text-muted-foreground"
          disabled={!onAbrirContrato} onClick={() => onAbrirContrato?.(a.financiamentoId)} title={`Financiamento: ${fraseDoOndeEsta(a)} · abrir o contrato`}
          data-testid="abrir-contrato-do-lancamento">↔ {fraseDoOndeEsta(a)}</button>
        {desfazivelPorAqui(a) && (
          <button type="button" className="shrink-0 text-destructive hover:underline" onClick={() => setDesfazendo(true)} data-testid="desfazer-financiamento">desfazer</button>
        )}
        {desfazendo && (
          <RemoverDialog titulo="Desfazer o vínculo com o financiamento" comMotivo
            frase={`O lançamento deixa de ser ${fraseDoOndeEsta(a)}. Ele não é apagado nem alterado; o contrato volta como estava.`}
            aoConfirmar={(motivo) => api.desfazer(a, motivo)} aoFechar={() => setDesfazendo(false)} />
        )}
      </span>
    );
  }
  const ehSaida = (d.tipoOperacao ?? '').startsWith('2-'); const ehEntrada = (d.tipoOperacao ?? '').startsWith('1-');
  if (!ehSaida && !ehEntrada) return null;
  const n = ehSaida ? d.parcelas.length : d.liberacoes.length;
  return (
    <>
      <Button variant="outline" size="sm" className="h-[22px] gap-1 px-[9px] text-[10px]" onClick={() => setAberto(true)} data-testid="acao-vincular-financiamento"
        title={n ? `${n} candidata(s) pelo motor do contrato` : 'Ligar este lançamento a uma parcela, liberação ou encargo de financiamento'}>
        <Link2 className="h-3 w-3" /> Financiamento{n ? ` (${n})` : ''}
      </Button>
      {aberto && <VincularFinanciamentoDialog dado={d} api={api} aoFechar={() => setAberto(false)} onCriarContrato={onCriarContrato ?? setCriando} />}
      {criando && (
        <CadastroDeContratoDialog aberto aoFechar={() => setCriando(null)}
          prefill={{ natureza: 'financiamento', valor: criando.valor, data: criando.data, descricao: criando.descricao ?? '' }} />
      )}
    </>
  );
}

export function VincularFinanciamentoDialog({ dado, api, aoFechar, onCriarContrato }: {
  dado: LancamentoNoFinanciamento; api: ReturnType<typeof useLancamentoNoFinanciamento>; aoFechar: () => void;
  onCriarContrato?: (l: LancamentoNoFinanciamento) => void;
}) {
  const ehSaida = (dado.tipoOperacao ?? '').startsWith('2-');
  const [aba, setAba] = useState<Aba>(ehSaida ? 'parcela' : 'liberacao');
  const [parcela, setParcela] = useState<ParcelaCandidata | null>(null);
  const [papel, setPapel] = useState<PapelDoPagamento>('principal');
  const [mover, setMover] = useState(false);
  const [previa, setPrevia] = useState<ResultadoDoVinculo | string | null>(null);
  const [liberacao, setLiberacao] = useState<LiberacaoCandidata | null>(null);
  const [encargo, setEncargo] = useState<EncargoDoLancamento | string | null>(null);
  const [contratoDoEncargo, setContratoDoEncargo] = useState<string | null>(null);
  const [papelDoEncargo, setPapelDoEncargo] = useState<PapelDoEncargo>('outro');
  const [recado, setRecado] = useState<{ texto: string; tom: 'erro' | 'ok' } | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    if (aba !== 'encargo' || encargo !== null) return;
    void api.lerEncargo().then((e) => {
      setEncargo(e);
      if (typeof e === 'object') { const p = PAPEIS_DO_ENCARGO.find((x) => x === e.papelSugerido); if (p) setPapelDoEncargo(p); }
    });
  }, [aba, encargo, api.lerEncargo]);

  const parcelaId = parcela?.parcelaId ?? null;
  useEffect(() => {
    if (!parcelaId) { setPrevia(null); return; }
    let vivo = true;
    setPrevia(null);
    void api.vincularParcela(parcelaId, papel, mover, true).then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [api.vincularParcela, parcelaId, papel, mover]);

  const gravarParcela = async () => {
    if (!parcela) return;
    setGravando(true);
    const r = await api.vincularParcela(parcela.parcelaId, papel, mover, false);
    setGravando(false);
    if (typeof r === 'string' || r.recusa) { setRecado({ texto: typeof r === 'string' ? r : r.recusa ?? '', tom: 'erro' }); return; }
    aoFechar();
  };
  const gravarLiberacao = async () => {
    if (!liberacao || !dado.data) return;
    setGravando(true);
    const e = await api.vincularLiberacao(liberacao.financiamentoId, dado.data, dado.valor);
    setGravando(false);
    if (e) { setRecado({ texto: e, tom: 'erro' }); return; }
    aoFechar();
  };
  const gravarEncargo = async () => {
    if (!contratoDoEncargo) return;
    setGravando(true);
    const e = await api.vincularEncargo(contratoDoEncargo, papelDoEncargo);
    setGravando(false);
    if (e) { setRecado({ texto: e, tom: 'erro' }); return; }
    aoFechar();
  };

  const recusa = typeof previa === 'string' ? previa : previa?.recusa ?? null;
  const precisaMover = !!parcela?.outro?.movivel && !mover;
  const textoParcela = recusa ?? (parcela && previa && typeof previa === 'object'
    ? [`como ${ROTULO_DO_PAPEL[papel]} da parcela ${parcela.parcela ?? '?'} de ${parcela.numeroContrato || parcela.descricaoContrato || 'contrato'}`,
       previa.cancelados ? `${previa.cancelados} programado(s) saem` : null, previa.paga ? 'a parcela fica paga' : 'a parcela segue em aberto', ...previa.avisos].filter(Boolean).join(' · ')
    : parcela ? 'Simulando…' : 'Escolha a parcela na lista.');
  const enc = typeof encargo === 'object' ? encargo : null;
  const texto = recado?.texto ?? (aba === 'parcela' ? textoParcela
    : aba === 'liberacao' ? (liberacao ? `Liberação "em conta" de ${br(dado.data)} · R$ ${num2(dado.valor)} no contrato ${liberacao.numeroContrato || liberacao.descricaoContrato || ''}` : 'Escolha o contrato na lista.')
    : aba === 'encargo' ? (typeof encargo === 'string' ? encargo : enc && !enc.elegivel ? enc.frase : contratoDoEncargo ? `Encargo (${papelDoEncargo}) do contrato escolhido` : 'Escolha o contrato.')
    : MOTIVO_CRIAR_CONTRATO_DEPOIS);
  const tom = recado?.tom === 'erro' || (aba === 'parcela' && recusa) || (aba === 'encargo' && enc && !enc.elegivel) ? 'text-destructive'
    : aba === 'parcela' && previa && typeof previa === 'object' && previa.avisos.length ? 'text-amber-700' : 'text-muted-foreground';

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[440px] w-[780px] max-w-[780px] flex-col gap-0 overflow-hidden p-0" data-testid="vincular-financiamento">
        <div className="flex h-[34px] shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="shrink-0 text-[11px] font-semibold">Vincular a financiamento</DialogTitle>
          <DialogDescription className="min-w-0 truncate text-[10px] text-primary-foreground/80" title={dado.descricao ?? undefined}>
            {br(dado.data)} · R$ {num2(dado.valor)} · {dado.descricao ?? '—'}
          </DialogDescription>
        </div>
        <div className="flex h-[32px] shrink-0 items-center px-3">
          <Segmentado altura={22} valor={aba} onEscolher={(v) => { setAba(v); setRecado(null); }} opcoes={[
            { valor: 'parcela', rotulo: 'Parcela', desabilitada: !ehSaida, title: ehSaida ? undefined : 'só uma saída paga parcela' },
            { valor: 'liberacao', rotulo: 'Liberação', desabilitada: ehSaida, title: ehSaida ? 'só uma entrada é liberação' : undefined },
            { valor: 'encargo', rotulo: 'Encargo', desabilitada: !ehSaida, title: ehSaida ? undefined : 'só uma saída é encargo' },
            { valor: 'criar', rotulo: 'Criar contrato' },
          ]} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3" data-testid="lista-do-vinculo">
          {aba === 'parcela' && (
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 84 }} /><col style={{ width: 76 }} /><col style={{ width: 200 }} /><col style={{ width: 96 }} /></colgroup>
              <thead><tr><th className={TH}>Contrato</th><th className={TH}>Parcela</th><th className={`${TH} text-right`}>Previsto</th><th className={`${TH} text-right`}>Diferença</th><th className={TH}>Por quê</th><th className={TH}>Paga</th></tr></thead>
              <tbody>
                {dado.parcelas.length === 0 && <tr><td colSpan={6} className={`${TD} text-muted-foreground`} data-testid="sem-parcela-candidata">Nenhuma parcela candidata a ±45 dias, com valor até 10% do previsto.</td></tr>}
                {dado.parcelas.map((p) => {
                  const bloqueada = !!p.outro && !p.outro.movivel;
                  return (
                    <tr key={p.parcelaId} data-testid="parcela-candidata" onClick={() => { if (bloqueada) return; setParcela(p); setMover(false); setRecado(null); if (p.papelSugerido) setPapel(p.papelSugerido); }}
                      className={`border-b ${bloqueada ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40'} ${parcela?.parcelaId === p.parcelaId ? 'bg-primary/10' : ''}`}
                      title={p.outro ? fraseDoOutro(p.outro) : undefined}>
                      <td className={TD} title={`${p.numeroContrato ?? ''} · ${p.descricaoContrato ?? ''} · ${p.credor ?? ''}`}>{p.numeroContrato || 'sem nº'} · {p.descricaoContrato}</td>
                      <td className={`${TD} tabular-nums`}>{p.parcela ?? '?'} · {br(p.vencimento)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{p.previsto === null ? '—' : num2(p.previsto)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{p.diferenca ? num2(p.diferenca) : '0,00'}</td>
                      <td className={`${TD} text-muted-foreground`} title={p.motivos.join(' · ')}>{p.motivos.join(' · ')}</td>
                      <td className={TD}>{p.papelSugerido ? ROTULO_DO_PAPEL[p.papelSugerido] : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {aba === 'liberacao' && (
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: 160 }} /><col style={{ width: 100 }} /><col style={{ width: 240 }} /></colgroup>
              <thead><tr><th className={TH}>Contrato</th><th className={TH}>Credor</th><th className={`${TH} text-right`}>Falta liberar</th><th className={TH}>Por quê</th></tr></thead>
              <tbody>
                {dado.liberacoes.length === 0 && <tr><td colSpan={4} className={`${TD} text-muted-foreground`} data-testid="sem-liberacao-candidata">Nenhum contrato vigente reconhece esta entrada como liberação.</td></tr>}
                {dado.liberacoes.map((c) => (
                  <tr key={c.financiamentoId} data-testid="liberacao-candidata" onClick={() => { setLiberacao(c); setRecado(null); }}
                    className={`cursor-pointer border-b hover:bg-muted/40 ${liberacao?.financiamentoId === c.financiamentoId ? 'bg-primary/10' : ''}`}>
                    <td className={TD} title={c.descricaoContrato ?? undefined}>{c.numeroContrato || 'sem nº'} · {c.descricaoContrato}</td>
                    <td className={TD} title={c.credor ?? undefined}>{c.credor ?? '—'}</td>
                    <td className={`${TD} text-right tabular-nums`}>{c.saldoALiberar === null ? '—' : num2(c.saldoALiberar)}</td>
                    <td className={`${TD} text-muted-foreground`} title={c.motivos.join(' · ')}>{c.motivos.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {aba === 'encargo' && (
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: 200 }} /><col style={{ width: 160 }} /></colgroup>
              <thead><tr><th className={TH}>Contrato</th><th className={TH}>Credor</th><th className={TH}>Por quê</th></tr></thead>
              <tbody>
                {encargo === null && <tr><td colSpan={3} className={`${TD} text-muted-foreground`}>Buscando…</td></tr>}
                {enc && enc.elegivel && enc.candidatas.map((c) => (
                  <tr key={c.financiamentoId} data-testid="encargo-candidato" onClick={() => { setContratoDoEncargo(c.financiamentoId); setRecado(null); }}
                    className={`cursor-pointer border-b hover:bg-muted/40 ${contratoDoEncargo === c.financiamentoId ? 'bg-primary/10' : ''}`}>
                    <td className={TD} title={c.contrato}>{c.contrato}</td>
                    <td className={TD} title={c.credor ?? undefined}>{c.credor ?? '—'}</td>
                    <td className={`${TD} text-muted-foreground`}>{[c.numeroNaDescricao ? 'nº na descrição' : null, c.mesmoCredor ? 'mesmo credor' : null].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {aba === 'criar' && <div className="pt-3 text-[10.5px] text-muted-foreground" data-testid="criar-contrato-aba">{onCriarContrato ? 'Abre o formulário do contrato já com a data, o valor e o favorecido deste lançamento.' : MOTIVO_CRIAR_CONTRATO_DEPOIS}</div>}
        </div>
        {/* a linha da escolha (28px, sempre presente): o papel do pagamento / do encargo e o "mover" */}
        <div className="flex h-[28px] shrink-0 items-center gap-2 border-t px-3 text-[10px]">
          {aba === 'parcela' && (
            <>
              <span className="text-muted-foreground">como</span>
              <Segmentado altura={22} valor={papel} onEscolher={setPapel} opcoes={PAPEIS.map((p) => ({ valor: p, rotulo: ROTULO_DO_PAPEL[p] }))} />
              {parcela?.outro?.movivel && (
                <label className="flex shrink-0 items-center gap-1 text-amber-700" title={fraseDoOutro(parcela.outro)} data-testid="mover-do-modal">
                  <Checkbox className="size-3" checked={mover} onCheckedChange={(v) => setMover(v === true)} /> mover ({fraseDoOutro(parcela.outro)})
                </label>
              )}
            </>
          )}
          {aba === 'encargo' && (
            <>
              <span className="text-muted-foreground">papel</span>
              <Segmentado altura={22} valor={papelDoEncargo} onEscolher={setPapelDoEncargo} opcoes={PAPEIS_DO_ENCARGO.map((p) => ({ valor: p, rotulo: p }))} />
            </>
          )}
        </div>
        <div className={`h-[30px] shrink-0 overflow-hidden px-3 pt-1 text-[10px] leading-[13px] ${tom}`} title={texto ?? undefined} data-testid="previa-do-vinculo">{texto}</div>
        <div className="flex h-[38px] shrink-0 items-center justify-end gap-2 border-t px-3">
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
          {aba === 'parcela' && <Button size="sm" className="h-[24px] text-[10px]" disabled={!parcela || gravando || !previa || !!recusa || precisaMover} onClick={() => void gravarParcela()} data-testid="gravar-parcela-do-modal">Vincular a esta parcela</Button>}
          {aba === 'liberacao' && <Button size="sm" className="h-[24px] text-[10px]" disabled={!liberacao || gravando || !dado.data} onClick={() => void gravarLiberacao()} data-testid="gravar-liberacao-do-modal">Vincular como liberação</Button>}
          {aba === 'encargo' && <Button size="sm" className="h-[24px] text-[10px]" disabled={!contratoDoEncargo || gravando || !enc?.elegivel} onClick={() => void gravarEncargo()} data-testid="gravar-encargo-do-modal">Vincular como encargo</Button>}
          {aba === 'criar' && <Button size="sm" className="h-[24px] text-[10px]" disabled={!onCriarContrato} title={onCriarContrato ? undefined : MOTIVO_CRIAR_CONTRATO_DEPOIS}
            onClick={() => { if (onCriarContrato) { aoFechar(); onCriarContrato(dado); } }} data-testid="criar-contrato-do-modal">Criar contrato</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

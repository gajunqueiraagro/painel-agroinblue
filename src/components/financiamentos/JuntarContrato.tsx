/**
 * FIN-CONTRATO-JUNTAR-01 (Gabriel 18/10/2026) — "Juntar" na linha do título do contrato de crédito e o "Desfazer" do Histórico.
 * O banco decide (`fn_financiamento_juntar`): a prévia é a própria gravação desfeita, e é dela que saem os números lado a lado
 * (este · o absorvido · depois) e a recusa — escrita no diálogo, nunca em toast. Gravar pede confirmação no rodapé.
 *
 * ⚠ SÓ DESENHA: nenhum número é somado aqui (o "depois" vem do banco); a divergência liberado × contratado só é comparada.
 * ⚠ TAMANHO FIXO: 760 × 400; o lugar da prévia / recusa (30px) e o rodapé (40px) existem sempre.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BlocoFormulario, CorpoFormulario, Rotulo } from '@/components/ui/bloco-formulario';
import type { ContratoAnterior, useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import {
  DICA_DO_JUNTAR, LINHAS_DA_COMPARACAO, MOTIVO_JUNTAR_SO_VIGENTE, SEM_CANDIDATO, fraseDaConfirmacao, fraseDosLancamentos, liberadoDiverge,
  podeJuntar, type ResultadoDaJuncao, type ResultadoDoDesfazerJuncao, type ResumoDaJuncao,
} from '@/lib/financiamentos/juntarContratos';

type ApiDoContrato = ReturnType<typeof useContratoDeCredito>;
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TH = 'h-[18px] bg-primary px-2 text-[9.5px] font-semibold text-primary-foreground';
const TD = 'h-[20px] px-2 text-[10.5px] tabular-nums';

/** o botão da linha do título — mora no lugar reservado de 58px (nada se move quando ele acende) */
export function BotaoJuntar({ status, onAbrir }: { status: string | null; onAbrir: () => void }) {
  const ok = podeJuntar(status);
  return (
    <Button variant="outline" size="sm" className="h-6 w-[58px] px-0 text-[10.5px]" disabled={!ok} onClick={onAbrir}
      title={ok ? DICA_DO_JUNTAR : MOTIVO_JUNTAR_SO_VIGENTE} data-testid="botao-juntar">Juntar</Button>
  );
}

function celula(r: ResumoDaJuncao | null, chave: (typeof LINHAS_DA_COMPARACAO)[number]['chave']): string {
  if (!r) return '…';
  const v = r[chave];
  if (v === null) return '?';
  return chave === 'parcelas' ? String(v) : num2(v);
}

export function TabelaDaComparacao({ r }: { r: ResultadoDaJuncao | null }) {
  const m = r?.antes?.mantido ?? null; const a = r?.antes?.absorvido ?? null; const d = r?.depois ?? null;
  return (
    <table className="w-full table-fixed border-collapse" data-testid="comparacao-da-juncao">
      <colgroup><col style={{ width: 130 }} /><col /><col /><col /></colgroup>
      <thead><tr>
        <th className={`${TH} text-left`}>Campo</th>
        <th className={`${TH} text-right`} title={m?.numero ?? undefined}>Este · antes</th>
        <th className={`${TH} text-right`} title={a?.numero ?? undefined}>Absorvido · antes</th>
        <th className={`${TH} text-right`}>Depois</th>
      </tr></thead>
      <tbody>
        {LINHAS_DA_COMPARACAO.map((l) => {
          const divergeDepois = l.chave === 'liberado' && d !== null && liberadoDiverge(d);
          return (
            <tr key={l.chave} className="border-b" data-testid={`linha-comparacao-${l.chave}`}>
              <td className={`${TD} text-muted-foreground`}>{l.rotulo}</td>
              <td className={`${TD} text-right`}>{celula(m, l.chave)}</td>
              <td className={`${TD} text-right`}>{celula(a, l.chave)}</td>
              <td className={`${TD} text-right font-semibold ${divergeDepois ? 'text-amber-700' : ''}`}
                title={divergeDepois && d ? `liberado ${num2(d.liberado)} · contratado ${num2(d.contratado)} — a divergência fica à vista` : undefined}
                data-testid={`depois-${l.chave}`}>{celula(d, l.chave)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function JuntarContratoDialog({ api, numero, aoFechar }: { api: Pick<ApiDoContrato, 'lerJuntaveis' | 'juntar'>; numero: string | null; aoFechar: () => void }) {
  const [opcoes, setOpcoes] = useState<(ContratoAnterior & { valor: number })[] | null>(null);
  const [absorver, setAbsorver] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ResultadoDaJuncao | string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { void api.lerJuntaveis().then(setOpcoes); }, [api.lerJuntaveis]);
  /* a prévia: uma simulação por escolha */
  useEffect(() => {
    if (!absorver) { setPrevia(null); return; }
    let vivo = true;
    setPrevia(null); setConfirmando(false); setErro(null);
    void api.juntar(absorver, true).then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [absorver, api.juntar]);

  const r = typeof previa === 'object' ? previa : null;
  const recusa = typeof previa === 'string' ? previa : r?.recusa ?? null;
  const pronto = !!r && !recusa && !!r.antes;
  const gravar = async () => {
    if (!absorver) return;
    setGravando(true); setErro(null);
    const g = await api.juntar(absorver, false);
    setGravando(false);
    if (typeof g === 'string') { setErro(g); setConfirmando(false); return; }
    if (g.recusa) { setErro(g.recusa); setConfirmando(false); return; }
    aoFechar();
  };
  const lista: OpcaoSearchable[] = (opcoes ?? []).map((o) => ({ value: o.id, label: `${o.numero || 'sem nº'} · ${o.descricao ?? ''} · ${num2(o.valor)}` }));
  const textoDaPrevia = erro ?? recusa ?? (opcoes !== null && opcoes.length === 0 ? SEM_CANDIDATO
    : !absorver ? 'Escolha o cadastro a absorver.' : r?.lancamentos ? fraseDosLancamentos(r.lancamentos) : 'Simulando…');

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[400px] w-[760px] max-w-[760px] flex-col gap-0 overflow-hidden p-0" data-testid="juntar-dialogo">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="truncate text-[11px] font-semibold">Juntar ao contrato {numero || 'sem nº'}</DialogTitle>
          <DialogDescription className="sr-only">{DICA_DO_JUNTAR}</DialogDescription>
        </div>
        <CorpoFormulario className="min-h-0 flex-1">
          <BlocoFormulario titulo="Cadastro a absorver" dica="só do mesmo credor e natureza, vigente">
            <Rotulo texto="Contrato" obrig />
            <div data-testid="seletor-do-absorvido">
              <SearchableSelect value={absorver ?? ''} onValueChange={(v) => setAbsorver(v || null)} options={lista}
                placeholder={opcoes === null ? 'Lendo…' : 'Escolha o outro cadastro'} semTodos />
            </div>
          </BlocoFormulario>
          <BlocoFormulario titulo="Simulação" dica="antes × depois, do banco">
            <TabelaDaComparacao r={pronto ? r : null} />
          </BlocoFormulario>
        </CorpoFormulario>
        <div className={`h-[30px] shrink-0 overflow-hidden truncate px-3 pt-1.5 text-[10px] ${erro || recusa ? 'text-destructive' : 'text-muted-foreground'}`}
          title={textoDaPrevia} data-testid="previa-da-juncao">{textoDaPrevia}</div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t px-3">
          <span className="min-w-0 flex-1 truncate text-[10px] text-amber-800" data-testid="confirmacao-da-juncao"
            title={confirmando && r?.antes ? fraseDaConfirmacao(r.antes.absorvido, r.antes.mantido) : undefined}>
            {confirmando && r?.antes ? fraseDaConfirmacao(r.antes.absorvido, r.antes.mantido) : ''}
          </span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={confirmando ? () => setConfirmando(false) : aoFechar}>
            {confirmando ? 'Não' : 'Voltar'}
          </Button>
          {confirmando
            ? <Button size="sm" className="h-[24px] text-[10px]" disabled={gravando} onClick={() => void gravar()} data-testid="confirmar-juncao">{gravando ? 'Gravando…' : 'Sim, juntar'}</Button>
            : <Button size="sm" className="h-[24px] text-[10px]" disabled={!pronto} onClick={() => setConfirmando(true)} data-testid="gravar-juncao">Juntar</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** o "Desfazer" do evento de junção no Histórico: a simulação primeiro, depois a confirmação */
export function DesfazerJuncaoDialog({ api, juncaoId, evento, aoFechar }: { api: Pick<ApiDoContrato, 'desfazerJuncao'>; juncaoId: string; evento: string; aoFechar: () => void }) {
  const [previa, setPrevia] = useState<ResultadoDoDesfazerJuncao | string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { let vivo = true; void api.desfazerJuncao(juncaoId, true).then((r) => { if (vivo) setPrevia(r); }); return () => { vivo = false; }; }, [juncaoId, api.desfazerJuncao]);
  const r = typeof previa === 'object' ? previa : null;
  const recusa = typeof previa === 'string' ? previa : r?.recusa ?? null;
  const gravar = async () => {
    setGravando(true); setErro(null);
    const g = await api.desfazerJuncao(juncaoId, false);
    setGravando(false);
    if (typeof g === 'string') { setErro(g); return; }
    if (g.recusa) { setErro(g.recusa); return; }
    aoFechar();
  };
  const texto = erro ?? recusa ?? (r?.mantido && r.absorvido
    ? `Volta: ${r.mantido.numero || 'sem nº'} contratado ${num2(r.mantido.contratado)} · ${r.mantido.parcelas} parcelas; ${r.absorvido.numero || 'sem nº'} volta a ${r.absorvido.status}, contratado ${num2(r.absorvido.contratado)} · ${r.absorvido.parcelas} parcelas.`
    : 'Simulando…');
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[190px] w-[520px] max-w-[520px] flex-col gap-0 overflow-hidden p-0" data-testid="desfazer-juncao-dialogo">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="truncate text-[11px] font-semibold">Desfazer: {evento}</DialogTitle>
          <DialogDescription className="sr-only">Volta os dois cadastros ao estado de antes da junção.</DialogDescription>
        </div>
        <div className={`min-h-0 flex-1 px-3 py-2 text-[10.5px] leading-[15px] ${erro || recusa ? 'text-destructive' : ''}`} data-testid="previa-do-desfazer">{texto}</div>
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-2 border-t px-3">
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[24px] text-[10px]" disabled={gravando || !r || !!recusa} onClick={() => void gravar()} data-testid="gravar-desfazer-juncao">
            {gravando ? 'Gravando…' : 'Desfazer junção'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

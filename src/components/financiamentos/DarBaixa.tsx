/**
 * FIN-FINANC-28 · PASSO 5 — "Dar baixa ▾" no contrato de crédito: quitado · rolado/renovado · prorrogado por aditivo · cancelado, e o
 * "Desfazer baixa" (o gesto contrário). O banco decide (`fn_financiamento_baixa`): a prévia é a própria gravação desfeita, e é dela
 * que saem o rodapé "principal X = liquidado Y · diferença Z", as parcelas que andam (prorrogação) e a recusa — escrita no diálogo.
 *
 * ⚠ TAMANHO FIXO: 600 × 430; a área dos campos tem 132px reservados em toda saída (o que não se aplica não aparece, e o lugar fica).
 */
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ContratoAnterior, useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import {
  DICA_DA_BAIXA, ROTULO_DA_BAIXA, TIPOS_DE_BAIXA, fraseDoRodape, podeDarBaixa, type ResultadoDaBaixa, type TipoDeBaixa,
} from '@/lib/financiamentos/baixaDoContrato';
import { hojeLocal } from '@/lib/datas/hojeLocal';

type ApiDoContrato = ReturnType<typeof useContratoDeCredito>;
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

export const MOTIVO_BAIXA_SO_VIGENTE = 'A baixa só se dá em contrato ativo ou prorrogado.';

/** O botão do cabeçalho: com o contrato vigente, o menu das quatro saídas; com uma baixa viva, "Desfazer baixa". */
export function BotaoDarBaixa({ status, api, onEscolher, onDesfazer, destaque = false }: {
  status: string | null; api: ApiDoContrato; onEscolher: (t: TipoDeBaixa) => void; onDesfazer: () => void;
  /** TELA DO CONTRATO v3: o "Dar baixa" em dourado (a ação principal da linha do título) */
  destaque?: boolean;
}) {
  if (!podeDarBaixa(status) && api.baixaViva) {
    return (
      <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={onDesfazer} data-testid="desfazer-baixa"
        title={`Baixa "${ROTULO_DA_BAIXA[api.baixaViva.tipo]}" de ${br(api.baixaViva.data)} · ${api.baixaViva.motivo}`}>Desfazer baixa</Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={destaque ? 'default' : 'outline'} size="sm" className={`gap-1 ${destaque ? 'h-[26px] px-2.5 text-[11px] bg-cta font-semibold text-cta-foreground hover:bg-cta-hover' : 'h-6 px-2 text-[10.5px]'}`} disabled={!podeDarBaixa(status)}
          title={podeDarBaixa(status) ? undefined : MOTIVO_BAIXA_SO_VIGENTE} data-testid="dar-baixa">
          Dar baixa <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {TIPOS_DE_BAIXA.map((t) => (
          <DropdownMenuItem key={t} onSelect={() => onEscolher(t)} title={DICA_DA_BAIXA[t]} data-testid={`baixa-${t}`}>{ROTULO_DA_BAIXA[t]}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid h-[28px] grid-cols-[150px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DarBaixaDialog({ api, tipo, aoFechar, onCriarContratoNovo, versaoDosContratos = 0 }: {
  api: ApiDoContrato; tipo: TipoDeBaixa; aoFechar: () => void; onCriarContratoNovo?: () => void;
  /** sobe quando o cadastro novo cria um contrato: a lista do "contrato novo" relê */
  versaoDosContratos?: number;
}) {
  const [data, setData] = useState<string>(hojeLocal());
  const [motivo, setMotivo] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [sucessor, setSucessor] = useState<string | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [meses, setMeses] = useState('1');
  const [aditivoAAnexar, setAditivoAAnexar] = useState(false);
  const [sucessores, setSucessores] = useState<ContratoAnterior[]>([]);
  const [previa, setPrevia] = useState<ResultadoDaBaixa | string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const temAditivo = (api.documentos ?? []).some((d) => d.especie === 'aditivo');

  useEffect(() => { if (tipo === 'rolado') void api.lerSucessores().then(setSucessores); }, [tipo, api.lerSucessores, versaoDosContratos]);

  const dados = (): Record<string, unknown> => ({
    data, motivo: motivo.trim(),
    ...(tipo === 'quitado' ? { confirmar_diferenca: confirmar } : {}),
    ...(tipo === 'rolado' ? { sucessor_id: sucessor, ...(valor !== null ? { valor } : {}) } : {}),
    ...(tipo === 'prorrogado' ? { meses: Number(meses), aditivo_a_anexar: aditivoAAnexar } : {}),
  });
  /* a prévia: refaz só com o que muda a resposta (o motivo não muda) */
  const chave = JSON.stringify({ tipo, data, confirmar, sucessor, valor, meses, aditivoAAnexar });
  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    const t = setTimeout(() => { void api.darBaixa(tipo, { ...dados(), motivo: 'simulação' }, true).then((r) => { if (vivo) setPrevia(r); }); }, 300);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume tudo o que muda a simulação
  }, [chave, api.darBaixa]);

  const r = typeof previa === 'object' ? previa : null;
  const recusa = typeof previa === 'string' ? previa : r?.recusa ?? null;
  const pedeConfirmacao = tipo === 'quitado' && !!recusa && /confirme a diferença/.test(recusa);
  const semMotivo = motivo.trim() === '';
  const gravar = async () => {
    if (semMotivo) { setErro('Informe o motivo da baixa.'); return; }
    setGravando(true); setErro(null);
    const g = await api.darBaixa(tipo, dados(), false);
    setGravando(false);
    if (typeof g === 'string') { setErro(g); return; }
    aoFechar();
  };
  const opcoesSuc: OpcaoSearchable[] = sucessores.map((s) => ({ value: s.id, label: `${s.numero || 'sem nº'} · ${s.descricao ?? ''}` }));
  const textoDaPrevia = erro ?? recusa ?? (r
    ? tipo === 'prorrogado'
      ? `${r.parcelas.length} parcela(s) andam: ${r.parcelas.slice(0, 4).map((p) => `${p.numero ?? '?'} ${br(p.de)} → ${br(p.para)}`).join(' · ')}${r.parcelas.length > 4 ? ' …' : ''}`
      : `${r.parcelas.length} parcela(s) em aberto saem · ${r.lancamentosCancelados} lançamento(s) programado(s) cancelado(s) (o "Desfazer baixa" recria)`
    : 'Simulando…');

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[430px] w-[600px] max-w-[600px] flex-col gap-0 overflow-hidden p-0" data-testid="dar-baixa-dialogo">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">Dar baixa · {ROTULO_DA_BAIXA[tipo]}</DialogTitle>
          <DialogDescription className="sr-only">{DICA_DA_BAIXA[tipo]}</DialogDescription>
        </div>
        <div className="h-[18px] shrink-0 truncate px-3 pt-1 text-[10px] text-muted-foreground" title={DICA_DA_BAIXA[tipo]}>{DICA_DA_BAIXA[tipo]}</div>
        <div className="min-h-0 flex-1 px-3 py-1">
          <Linha rotulo="Data">
            <DatePicker size="compact" value={data} onChange={(v) => setData(v ?? hojeLocal())} />
          </Linha>
          {/* a área da saída: 112px reservados em todas */}
          <div className="h-[112px]" data-testid="campos-da-baixa">
            {tipo === 'quitado' && (
              <Linha rotulo="Diferença">
                <label className={`flex items-center gap-1.5 text-[10px] ${pedeConfirmacao || confirmar ? '' : 'text-muted-foreground'}`}>
                  <Checkbox className="size-3" checked={confirmar} onCheckedChange={(v) => setConfirmar(v === true)} data-testid="confirmar-diferenca" />
                  quitar mesmo com a diferença do rodapé
                </label>
              </Linha>
            )}
            {tipo === 'rolado' && (
              <>
                <Linha rotulo="Contrato novo *">
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <SearchableSelect value={sucessor ?? ''} onValueChange={(v) => setSucessor(v || null)} options={opcoesSuc} placeholder="Escolha o contrato que liquida este" semTodos />
                    </div>
                    {onCriarContratoNovo && <Button variant="outline" size="sm" className="h-[24px] shrink-0 px-2 text-[10px]" onClick={onCriarContratoNovo}>Criar contrato novo</Button>}
                  </div>
                </Linha>
                <Linha rotulo="Valor liquidado"><CampoMoeda valor={valor ?? 0} onChange={(n) => setValor(n > 0 ? n : null)} placeholder="o saldo devedor" title="vazio = o saldo devedor do contrato" /></Linha>
              </>
            )}
            {tipo === 'prorrogado' && (
              <>
                <Linha rotulo="Meses de prorrogação *">
                  <Input className="h-[24px] w-[80px] text-[11px] tabular-nums" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value.replace(/\D/g, '').slice(0, 3))} data-testid="meses-prorrogacao" />
                </Linha>
                <Linha rotulo="Aditivo">
                  {temAditivo ? <span className="text-[10px] text-[#15803d]">aditivo anexado em Documentos ✓</span> : (
                    <label className="flex items-center gap-1.5 text-[10px]">
                      <Checkbox className="size-3" checked={aditivoAAnexar} onCheckedChange={(v) => setAditivoAAnexar(v === true)} data-testid="aditivo-a-anexar" />
                      aditivo a anexar (fica como pendência do contrato)
                    </label>
                  )}
                </Linha>
              </>
            )}
            {tipo === 'cancelado' && <div className="pt-1 text-[10px] text-muted-foreground">O contrato e as parcelas saem; os lançamentos programados são cancelados. Recusa se houver parcela paga ou liberação.</div>}
          </div>
          <Linha rotulo="Motivo *">
            <Input className={`h-[24px] text-[11px] ${erro && semMotivo ? 'border-destructive' : ''}`} value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} data-testid="motivo-da-baixa" />
          </Linha>
        </div>
        {/* o lugar da prévia / recusa: 44px, sempre presente */}
        <div className={`h-[44px] shrink-0 overflow-hidden px-3 pt-1 text-[10px] leading-[13px] ${erro || (recusa && !pedeConfirmacao) ? 'text-destructive' : pedeConfirmacao ? 'text-amber-700' : 'text-muted-foreground'}`}
          title={textoDaPrevia} data-testid="previa-da-baixa">{textoDaPrevia}</div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t px-3">
          <span className="min-w-0 flex-1 truncate text-[10px] tabular-nums" title={fraseDoRodape(r)} data-testid="rodape-da-baixa">{fraseDoRodape(r)}</span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[24px] text-[10px]" disabled={gravando || !r || !!recusa} onClick={() => void gravar()} data-testid="gravar-baixa">
            {gravando ? 'Gravando…' : `Dar baixa: ${ROTULO_DA_BAIXA[tipo].toLowerCase()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

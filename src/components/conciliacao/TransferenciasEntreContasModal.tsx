/**
 * TRANSFERÊNCIAS ENTRE CONTAS — PR-CONC-TRANSFERENCIAS-01.
 *
 * ⚠ O PASSO DO FLUXO DO MÊS (Gabriel): importar todos os OFX → Casar lançamentos → TRANSFERÊNCIAS ENTRE CONTAS → Criar
 *   lançamentos em lote → Enriquecer · Excel. Sem ele, a saída num banco e a entrada no outro viram dois crus soltos:
 *   dinheiro mudando de bolso contado como despesa e como receita.
 * ⚠ O SISTEMA SUGERE, O OPERADOR CONFIRMA: a lista vem de `fn_transferencias_sugeridas` (o banco resolve o que fecha 1:1
 *   e o nó que só o mesmo dia resolve); o ambíguo pede a escolha da entrada. "Confirmar selecionadas" roda a PRÉVIA
 *   (`p_simular`) e só o segundo clique grava — cada par numa transação: 1 transferência (18010) e as duas pontas
 *   conciliadas, ou as duas pontas casadas na transferência que já estava lançada ("casa na existente").
 * ⚠ CASCA DO `SugestoesCasarModal` e a régua da casa: 9,5px, linha de 18px, cabeçalho navy fixo, uma informação por
 *   coluna, Data primeiro, SEM QUEBRA — as colunas foram medidas no maior texto real do NJ set/26 (a descrição do
 *   Sicredi, 61 caracteres). O que não couber na largura da tela rola na horizontal DENTRO da mesa, com o cabeçalho.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { fmtBRL, fmtData } from '@/components/conciliacao/TabelaExtratoDoMes';
import {
  textoMotivo,
  type LinhaTransferencia, type PontaTransferencia, type ResultadoTransferencia,
} from '@/hooks/useTransferenciasSugeridas';

const CEL = 'px-[4px] whitespace-nowrap';
const DIVISOR = 'border-l border-border';
const SELO = 'inline-block rounded-[3px] border px-[4px] py-[1px] text-[8px] font-semibold leading-[8px] align-middle';
const SELO_EXISTENTE = 'border-dashed border-[#1d4ed8] text-[#1d4ed8]';

/* ⚠ LARGURAS MEDIDAS NA TELA (Inter 9,5px, NJ set/26, `Range` / 0,95 do zoom do Dialog): pior texto + 8 de folga + 8 de
     padding. Data 46 ("24/09", 29,5) · conta 141 ("Invest-Sicredi PJ Pecuária", 125,1 — a maior conta de banco do NJ, não
     só as do mês) · descrição da saída 301 ("PIX ENVIADO NATALINO CAVALLI JUNIOR 214.244.128-97", 284,9) · valor 74
     ("700.000,00", 57,2) · descrição da entrada 369 ("RECEBIMENTO PIX-PIX_CRED  21424412897 NATALINO CAVALLI JUNIOR",
     352,7) · ação 98 (selo "casa na existente", 81,7).
   ⚠ SÃO 1.238px E NÃO CABEM NA JANELA DO GABRIEL (innerWidth 1.135 → mesa visível de 1.050): a mesa rola ~190px na
     horizontal dentro do próprio scrollport, com o cabeçalho junto. Custo da regra "sem quebra, sem reticência". */
export const COLUNAS_TRANSF = [22, 46, 141, 301, 74, 46, 141, 369, 98];
const LARGURA_MESA = COLUNAS_TRANSF.reduce((a, b) => a + b, 0);

interface ItemPrevia { saidaId: string; entradaId: string; valor: number; res: ResultadoTransferencia }

interface Props {
  open: boolean;
  onClose: () => void;
  rotuloMes: string;
  linhas: readonly LinhaTransferencia[];
  carregando?: boolean;
  erro?: string | null;
  fechar: (saidaId: string, entradaId: string, simular: boolean) => Promise<ResultadoTransferencia>;
  /** Depois de gravar (só no sucesso): relê a lista e avisa quem mostra lançamento. */
  aoGravar: () => void | Promise<void>;
}

const resolvida = (l: LinhaTransferencia) => l.como !== 'ambiguo' && !!l.entrada;

export function TransferenciasEntreContasModal({ open, onClose, rotuloMes, linhas, carregando, erro, fechar, aoGravar }: Props) {
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<ItemPrevia[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /* A lista mudou (abriu, gravou, releu): o resolvido nasce marcado; o ambíguo espera a escolha da entrada. */
  const chaveLista = linhas.map((l) => l.saida.id).join(',');
  useEffect(() => {
    setMarcados(new Set(linhas.filter(resolvida).map((l) => l.saida.id)));
    setEscolha({});
    setPrevia(null);
  }, [chaveLista]); // eslint-disable-line react-hooks/exhaustive-deps -- a lista é a chave

  const entradaDe = (l: LinhaTransferencia): (PontaTransferencia & { existente_id?: string | null }) | null => {
    if (l.entrada) return l.entrada;
    return l.candidatas.find((c) => c.id === escolha[l.saida.id]) ?? null;
  };
  const existenteDe = (l: LinhaTransferencia): string | null =>
    l.entrada ? l.existente_id : (l.candidatas.find((c) => c.id === escolha[l.saida.id])?.existente_id ?? null);

  const selecionados = useMemo(
    () => linhas.filter((l) => marcados.has(l.saida.id) && !!entradaDe(l)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entradaDe lê `escolha`
    [linhas, marcados, escolha],
  );

  const alternar = (id: string) => {
    setPrevia(null); setAviso(null);
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const escolher = (saidaId: string, entradaId: string) => {
    setPrevia(null); setAviso(null);
    setEscolha((e) => ({ ...e, [saidaId]: entradaId }));
    setMarcados((m) => new Set(m).add(saidaId));
  };

  /* 1º clique: a prévia pela própria RPC, com p_simular — nada grava. */
  const verPrevia = async () => {
    setOcupado(true); setAviso(null);
    try {
      const itens: ItemPrevia[] = [];
      for (const l of selecionados) {
        const e = entradaDe(l);
        if (!e) continue;
        itens.push({ saidaId: l.saida.id, entradaId: e.id, valor: e.valor, res: await fechar(l.saida.id, e.id, true) });
      }
      setPrevia(itens);
    } finally {
      setOcupado(false);
    }
  };

  /* 2º clique: grava cada par que a prévia aceitou — cada um numa transação da RPC. */
  const gravar = async () => {
    if (!previa) return;
    setOcupado(true);
    let ok = 0;
    const recusas: string[] = [];
    try {
      for (const it of previa.filter((p) => p.res.ok)) {
        const r = await fechar(it.saidaId, it.entradaId, false);
        if (r.ok) ok += 1; else recusas.push(`${fmtBRL(it.valor)}: ${textoMotivo(r.motivo)}`);
      }
    } finally {
      setOcupado(false);
    }
    setPrevia(null);
    setAviso(`${ok} transferência${ok === 1 ? '' : 's'} gravada${ok === 1 ? '' : 's'}`
      + (recusas.length ? ` · ${recusas.length} recusada${recusas.length === 1 ? '' : 's'} (${recusas.join('; ')})` : ''));
    if (ok > 0) await aoGravar();
  };

  const aceitos = previa?.filter((p) => p.res.ok) ?? [];
  const recusados = previa?.filter((p) => !p.res.ok) ?? [];
  const casam = aceitos.filter((p) => p.res.acao === 'casar_existente').length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[1266px] max-w-[95vw] grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden"
        aria-describedby={undefined} data-testid="transferencias-entre-contas">
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[12px] font-medium">Transferências entre contas</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-3 pt-2 pb-1.5 text-[10px] text-muted-foreground">
          {rotuloMes} · a saída num banco e a entrada no outro viram <span className="text-foreground">uma</span> transferência, com as duas pontas conciliadas
        </div>

        {/* ⚠ UM SCROLLPORT SÓ: o cabeçalho navy fica, as linhas rolam — e a mesa rola na horizontal aqui dentro. */}
        <div className="mx-3 max-h-[60vh] overflow-auto border rounded-sm">
          <table className="table-fixed border-collapse text-[9.5px]" style={{ width: LARGURA_MESA }}>
            <colgroup>
              {COLUNAS_TRANSF.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
              <tr className="h-[18px]">
                {['', 'Data', 'Saída', 'Descrição', 'Valor', 'Data', 'Entrada', 'Descrição', ''].map((h, i) => (
                  <th key={i} className={cn('px-[4px] text-center font-medium whitespace-nowrap', i === 5 && 'border-l border-primary-foreground/30')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr className="h-[18px]"><td colSpan={9} className="px-[4px] italic text-muted-foreground">carregando…</td></tr>
              )}
              {!carregando && erro && (
                <tr className="h-[18px]"><td colSpan={9} className="px-[4px] text-rose-600">{erro}</td></tr>
              )}
              {!carregando && !erro && linhas.length === 0 && (
                <tr className="h-[18px]"><td colSpan={9} className="px-[4px] italic text-muted-foreground">nenhuma transferência entre contas pendente neste mês</td></tr>
              )}
              {linhas.map((l, i) => {
                const e = entradaDe(l);
                const existente = existenteDe(l);
                const recusa = previa?.find((p) => p.saidaId === l.saida.id && !p.res.ok);
                return (
                  <tr key={l.saida.id} data-testid="transferencia"
                    title={l.como === 'mesmo_dia' ? 'resolvida pelo mesmo dia' : undefined}
                    className={cn('h-[18px] border-b border-border/50', i % 2 === 1 && 'bg-muted/30')}>
                    <td className="px-[4px] text-center">
                      <input type="checkbox" className="h-3 w-3 cursor-pointer align-middle" disabled={!e}
                        aria-label={`Transferência ${fmtBRL(Math.abs(l.saida.valor))} de ${fmtData(l.saida.data)}`}
                        checked={!!e && marcados.has(l.saida.id)} onChange={() => alternar(l.saida.id)} />
                    </td>
                    <td className={cn(CEL, 'tabular-nums')}>{fmtData(l.saida.data)}</td>
                    <td className={CEL}>{l.saida.conta ?? '—'}</td>
                    <td className={CEL}>{l.saida.descricao ?? '—'}</td>
                    <td className={cn(CEL, 'text-right tabular-nums font-medium')}>{fmtBRL(Math.abs(l.saida.valor))}</td>
                    <td className={cn(CEL, DIVISOR, 'tabular-nums')}>{e ? fmtData(e.data) : '—'}</td>
                    <td className={CEL}>
                      {l.como === 'ambiguo' ? (
                        <Select value={escolha[l.saida.id] ?? ''} onValueChange={(v) => escolher(l.saida.id, v)}>
                          <SelectTrigger className="h-[16px] px-1 text-[9.5px] border-amber-500" data-testid="escolher-entrada"
                            aria-label={`Entrada da saída de ${fmtData(l.saida.data)}`}>
                            <SelectValue placeholder="escolher" />
                          </SelectTrigger>
                          <SelectContent>
                            {l.candidatas.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-[10px]">
                                {`${fmtData(c.data)} · ${c.conta ?? '—'} · ${c.descricao ?? ''}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (e?.conta ?? '—')}
                    </td>
                    <td className={CEL}>{e?.descricao ?? '—'}</td>
                    <td className={cn(CEL, 'text-center')}>
                      {recusa
                        ? <span className="text-rose-600" data-testid="recusa-transferencia">{textoMotivo(recusa.res.motivo)}</span>
                        : existente
                          ? <span className={cn(SELO, SELO_EXISTENTE)} data-testid="selo-existente">casa na existente</span>
                          : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex min-h-[30px] items-center justify-between gap-2 px-3 py-1">
          <span className="text-[9.5px] text-muted-foreground" data-testid="previa-transferencias">
            {aviso ?? (previa
              ? `${aceitos.length} transferência${aceitos.length === 1 ? '' : 's'}: ${aceitos.length - casam} nova${aceitos.length - casam === 1 ? '' : 's'}`
                + `${casam ? ` · ${casam} casa${casam === 1 ? '' : 'm'} na existente` : ''}`
                + ` · ${fmtBRL(aceitos.reduce((t, p) => t + p.valor, 0))}`
                + `${recusados.length ? ` · ${recusados.length} recusada${recusados.length === 1 ? '' : 's'}` : ''}`
              : `${selecionados.length} de ${linhas.length} selecionada${linhas.length === 1 ? '' : 's'}`)}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-[22px] rounded border px-2 text-[10px] hover:bg-muted">Fechar</button>
            {previa ? (
              <button type="button" onClick={gravar} disabled={ocupado || aceitos.length === 0}
                className="h-[22px] rounded bg-primary px-2 text-[10px] text-primary-foreground disabled:opacity-50">
                Confirmar transferência ({aceitos.length})
              </button>
            ) : (
              <button type="button" onClick={verPrevia} disabled={ocupado || selecionados.length === 0}
                className="h-[22px] rounded bg-primary px-2 text-[10px] text-primary-foreground disabled:opacity-50">
                Confirmar selecionadas ({selecionados.length})
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

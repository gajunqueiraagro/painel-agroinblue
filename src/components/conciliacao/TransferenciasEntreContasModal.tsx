/**
 * TRANSFERÊNCIAS ENTRE CONTAS — PR-CONC-TRANSFERENCIAS-01.
 *
 * ⚠ O PASSO DO FLUXO DO MÊS (Gabriel): importar todos os OFX → Casar lançamentos → TRANSFERÊNCIAS ENTRE CONTAS → Criar
 *   lançamentos em lote → Enriquecer · Excel. Sem ele, a saída num banco e a entrada no outro viram dois crus soltos:
 *   dinheiro mudando de bolso contado como despesa e como receita.
 * ⚠ O SISTEMA SUGERE, O OPERADOR CONFIRMA: a lista vem de `fn_transferencias_sugeridas` (o banco resolve o que fecha 1:1
 *   e o nó que só o mesmo dia resolve); o ambíguo pede a escolha da entrada. Cada par grava numa transação: 1
 *   transferência (18010) e as duas pontas conciliadas, ou as duas pontas casadas na transferência que já estava lançada
 *   ("casa na existente").
 * ⚠ UM CLIQUE GRAVA — PR-CONC-TRANSFERENCIAS-01-fix1 (homologação do Gabriel, 30/09 17:56: "o primeiro clique não faz
 *   nada visível"). A PRÉVIA (`p_simular`) roda SOZINHA ao abrir e a cada mudança de seleção/contraparte, e aparece no
 *   rodapé; "Confirmar transferências (N)" grava de primeira. Desligado, diz por quê ao lado; gravando, trava o duplo
 *   clique por REF (o estado só vale no próximo render — dois cliques no mesmo tique passariam os dois). O padrão é o do
 *   `PropagarRecorrenciaDialog`: prévia lida antes, um botão que grava.
 * ⚠ CASCA DO `SugestoesCasarModal` e a régua da casa: 9,5px, linha de 18px, cabeçalho navy fixo, uma informação por
 *   coluna, Data primeiro, SEM QUEBRA — as colunas foram medidas no maior texto real do NJ set/26 (a descrição do
 *   Sicredi, 61 caracteres). O que não couber na largura da tela rola na horizontal DENTRO da mesa, com o cabeçalho.
 * ⚠ A MEIA TRANSFERÊNCIA ENTRA NA MESMA TABELA (CONC-TRANSF-SEGUNDA-PONTA-01): o extrato livre na sua coluna (saída ou
 *   entrada) e a ponta já conciliada na outra, em muted, com "já conciliada". É 1:1 por construção (o banco só lista o
 *   par único), então nasce marcada; a prévia e a gravação vão por `fecharMeia` (`fn_transferencia_segunda_ponta`), e o
 *   "Confirmar transferências (N)" conta as duas espécies juntas.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { fmtBRL, fmtData } from '@/components/conciliacao/TabelaExtratoDoMes';
import {
  textoMotivo,
  type LinhaMeiaPonta, type LinhaTransferencia, type PontaTransferencia, type ResultadoTransferencia,
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

/* `par`: a = saída, b = entrada (fn_transferencia_de_extratos). `meia`: a = extrato livre, b = transferência
   (fn_transferencia_segunda_ponta). `chave` é a da linha na tabela. */
interface ItemPrevia { chave: string; tipo: 'par' | 'meia'; a: string; b: string; valor: number; res: ResultadoTransferencia }
type Pendente = Omit<ItemPrevia, 'res'>;

const MUTED = 'text-muted-foreground';
const chaveMeia = (m: LinhaMeiaPonta) => `meia:${m.extrato.id}`;

interface Props {
  open: boolean;
  onClose: () => void;
  rotuloMes: string;
  linhas: readonly LinhaTransferencia[];
  carregando?: boolean;
  erro?: string | null;
  fechar: (saidaId: string, entradaId: string, simular: boolean) => Promise<ResultadoTransferencia>;
  /** Meias transferências (uma ponta conciliada, a outra livre) — na mesma tabela, pré-marcadas. */
  meias?: readonly LinhaMeiaPonta[];
  /** A segunda ponta de uma meia transferência (`simular` não grava). */
  fecharMeia?: (extratoId: string, lancamentoId: string, simular: boolean) => Promise<ResultadoTransferencia>;
  /** Depois de gravar (só no sucesso): relê a lista e avisa quem mostra lançamento. */
  aoGravar: () => void | Promise<void>;
}

const resolvida = (l: LinhaTransferencia) => l.como !== 'ambiguo' && !!l.entrada;

const SEM_MEIAS: readonly LinhaMeiaPonta[] = [];

export function TransferenciasEntreContasModal({
  open, onClose, rotuloMes, linhas, meias = SEM_MEIAS, carregando, erro, fechar, fecharMeia, aoGravar,
}: Props) {
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<ItemPrevia[] | null>(null);
  const [previaCarregando, setPreviaCarregando] = useState(false);
  const [previaErro, setPreviaErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const gravandoRef = useRef(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /* A lista mudou (abriu, gravou, releu): o resolvido nasce marcado; o ambíguo espera a escolha da entrada. */
  const chaveLista = [...linhas.map((l) => l.saida.id), ...meias.map(chaveMeia)].join(',');
  useEffect(() => {
    setMarcados(new Set([...linhas.filter(resolvida).map((l) => l.saida.id), ...meias.map(chaveMeia)]));
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

  const meiasMarcadas = meias.filter((m) => marcados.has(chaveMeia(m)));
  const nSelecionadas = selecionados.length + meiasMarcadas.length;
  const nLinhas = linhas.length + meias.length;

  const alternar = (id: string) => {
    setAviso(null);
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const escolher = (saidaId: string, entradaId: string) => {
    setAviso(null);
    setEscolha((e) => ({ ...e, [saidaId]: entradaId }));
    setMarcados((m) => new Set(m).add(saidaId));
  };

  /* A PRÉVIA RODA SOZINHA: ao abrir e a cada mudança de seleção ou de contraparte, pela própria RPC com p_simular —
     nada grava. A resposta de uma seleção antiga que chega depois é descartada (`vivo`). */
  const pares: Pendente[] = [
    ...selecionados.flatMap((l): Pendente[] => {
      const e = entradaDe(l);
      return e ? [{ chave: l.saida.id, tipo: 'par', a: l.saida.id, b: e.id, valor: e.valor }] : [];
    }),
    ...meiasMarcadas.map((m): Pendente => ({
      chave: chaveMeia(m), tipo: 'meia', a: m.extrato.id, b: m.transferencia_id, valor: Math.abs(m.extrato.valor),
    })),
  ];
  const chavePares = pares.map((p) => `${p.a}>${p.b}`).join(',');
  /* Uma linha pela RPC da sua espécie. Sem `fecharMeia` (quem não passa meias), a meia é recusada — nunca gravada. */
  const executar = (p: Pendente, simular: boolean): Promise<ResultadoTransferencia> =>
    p.tipo === 'par' ? fechar(p.a, p.b, simular)
      : fecharMeia ? fecharMeia(p.a, p.b, simular) : Promise.resolve({ ok: false, motivo: 'recusado' });
  useEffect(() => {
    if (!open) return undefined;
    let vivo = true;
    setPrevia(null); setPreviaErro(null);
    if (pares.length === 0) { setPrevia([]); setPreviaCarregando(false); return undefined; }
    setPreviaCarregando(true);
    (async () => {
      try {
        const itens: ItemPrevia[] = [];
        for (const p of pares) itens.push({ ...p, res: await executar(p, true) });
        if (vivo) setPrevia(itens);
      } catch (e) {
        if (vivo) setPreviaErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (vivo) setPreviaCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [open, chavePares]); // eslint-disable-line react-hooks/exhaustive-deps -- os pares são a chave

  const aceitos = previa?.filter((p) => p.res.ok) ?? [];
  const recusados = previa?.filter((p) => !p.res.ok) ?? [];
  const casam = aceitos.filter((p) => p.res.acao === 'casar_existente').length;

  /* O motivo de o botão estar desligado — fonte única do `disabled`, do `title` e do texto ao lado. */
  const motivoDesligado = gravando ? 'gravando…'
    : previaCarregando ? 'conferindo a prévia…'
    : previaErro ? `a prévia falhou: ${previaErro}`
    : nSelecionadas === 0 ? 'nenhuma transferência selecionada'
    : aceitos.length === 0 ? 'o banco recusou todas as selecionadas'
    : null;

  /* UM CLIQUE GRAVA cada par que a prévia aceitou — cada um numa transação da RPC. */
  const gravar = async () => {
    if (gravandoRef.current || motivoDesligado) return;
    gravandoRef.current = true;
    setGravando(true); setAviso(null);
    let ok = 0;
    const recusas: string[] = [];
    try {
      for (const it of aceitos) {
        const r = await executar(it, false);
        if (r.ok) ok += 1; else recusas.push(`${fmtBRL(it.valor)}: ${textoMotivo(r.motivo)}`);
      }
      /* A recusa fica no modal, ao lado do botão (UX-TOAST-01); o toast só diz o que foi feito, e tem X. */
      if (recusas.length) setAviso(`${recusas.length} recusada${recusas.length === 1 ? '' : 's'} (${recusas.join('; ')})`);
      if (ok > 0) {
        toast.success(`${ok} transferência${ok === 1 ? '' : 's'} conciliada${ok === 1 ? '' : 's'}`, { closeButton: true });
        /* ⚠ A TRAVA SÓ SAI DEPOIS DA RELEITURA: até a lista voltar, a prévia ainda é a de antes e mostraria de novo os
           pares que acabaram de gravar. */
        await aoGravar();
      }
    } finally {
      gravandoRef.current = false;
      setGravando(false);
    }
  };

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
              {!carregando && !erro && nLinhas === 0 && (
                <tr className="h-[18px]"><td colSpan={9} className="px-[4px] italic text-muted-foreground">nenhuma transferência entre contas pendente neste mês</td></tr>
              )}
              {linhas.map((l, i) => {
                const e = entradaDe(l);
                const existente = existenteDe(l);
                const recusa = previa?.find((p) => p.chave === l.saida.id && !p.res.ok);
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
              {meias.map((m, j) => {
                const k = chaveMeia(m);
                const livreSai = m.extrato.valor < 0;
                const recusa = previa?.find((p) => p.chave === k && !p.res.ok);
                /* a ponta já conciliada: data e conta dela, "já conciliada" no lugar da descrição, tudo em muted */
                const ligada = { data: fmtData(m.ponta_ligada.data), conta: m.ponta_ligada.conta ?? '—', descricao: 'já conciliada' };
                const livre = { data: fmtData(m.extrato.data), conta: m.extrato.conta ?? '—', descricao: m.extrato.descricao ?? '—' };
                const saida = livreSai ? livre : ligada;
                const entrada = livreSai ? ligada : livre;
                return (
                  <tr key={k} data-testid="transferencia" data-meia-ponta=""
                    className={cn('h-[18px] border-b border-border/50', (linhas.length + j) % 2 === 1 && 'bg-muted/30')}>
                    <td className="px-[4px] text-center">
                      <input type="checkbox" className="h-3 w-3 cursor-pointer align-middle"
                        aria-label={`Transferência ${fmtBRL(Math.abs(m.extrato.valor))} de ${fmtData(m.extrato.data)}`}
                        checked={marcados.has(k)} onChange={() => alternar(k)} />
                    </td>
                    <td className={cn(CEL, 'tabular-nums', !livreSai && MUTED)}>{saida.data}</td>
                    <td className={cn(CEL, !livreSai && MUTED)}>{saida.conta}</td>
                    <td className={cn(CEL, !livreSai && MUTED)}>{saida.descricao}</td>
                    <td className={cn(CEL, 'text-right tabular-nums font-medium')}>{fmtBRL(Math.abs(m.extrato.valor))}</td>
                    <td className={cn(CEL, DIVISOR, 'tabular-nums', livreSai && MUTED)}>{entrada.data}</td>
                    <td className={cn(CEL, livreSai && MUTED)}>{entrada.conta}</td>
                    <td className={cn(CEL, livreSai && MUTED)}>{entrada.descricao}</td>
                    <td className={cn(CEL, 'text-center')}>
                      {recusa
                        ? <span className="text-rose-600" data-testid="recusa-transferencia">{textoMotivo(recusa.res.motivo)}</span>
                        : <span className={cn(SELO, SELO_EXISTENTE)} data-testid="selo-existente">casa na existente</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex min-h-[30px] items-center justify-between gap-2 px-3 py-1">
          <span className="text-[9.5px] text-muted-foreground" data-testid="previa-transferencias">
            {aviso ?? (previa && previa.length > 0
              ? `${aceitos.length} transferência${aceitos.length === 1 ? '' : 's'}: ${aceitos.length - casam} nova${aceitos.length - casam === 1 ? '' : 's'}`
                + `${casam ? ` · ${casam} casa${casam === 1 ? '' : 'm'} na existente` : ''}`
                + ` · ${fmtBRL(aceitos.reduce((t, p) => t + p.valor, 0))}`
                + `${recusados.length ? ` · ${recusados.length} recusada${recusados.length === 1 ? '' : 's'}` : ''}`
              : `${nSelecionadas} de ${nLinhas} selecionada${nLinhas === 1 ? '' : 's'}`)}
          </span>
          <div className="flex items-center gap-2">
            {motivoDesligado && (
              <span className="text-[10px] text-muted-foreground" data-testid="motivo-desligado">{motivoDesligado}</span>
            )}
            <button type="button" onClick={onClose} className="h-[22px] rounded border px-2 text-[10px] hover:bg-muted">Fechar</button>
            <button type="button" onClick={gravar} disabled={!!motivoDesligado} title={motivoDesligado ?? undefined}
              className="h-[22px] rounded bg-primary px-2 text-[10px] text-primary-foreground disabled:opacity-50">
              {gravando ? 'Gravando…' : `Confirmar transferências (${aceitos.length})`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

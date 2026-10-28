/**
 * P128b (NOTA-JA-LANCADA; mock aprovado, casos 1b e 3) — A PRÉVIA CAMPO A CAMPO do "Completar com a nota": uma linha por parcela, uma coluna
 * por campo, com a caixa "atualizar em todas" no cabeçalho. O VALOR PARA TODAS vem do bloco "Lançamento" da prévia da nota (fornecedor,
 * fazenda, conta, subcentro, safra) e daqui (a descrição BASE, que vira "<base> i/N"; o nº do documento; a competência = emissão).
 * ⚠ A REGRA É DO BANCO: cada mudança pede a `fn_nota_completar` com `p_simular` e a tabela desenha o que ela devolve — hoje → fica, "igual",
 *   o cadeado (conciliada/paga: conta, valor e vencimento nunca mudam) e o efeito no DRE. Nada é gravado antes do clique.
 * ⚠ ✎ NA CÉLULA: "manter o de hoje nesta parcela" (e volta). A coluna desmarcada não vai ao pedido.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { REGUA_ROTULO } from '@/components/ui/bloco-formulario';
import { TD_REGUA, TD_REGUA_NUM, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { reais } from '@/lib/financeiro/nfe/formatos';
import { completarComANota } from '@/lib/financeiro/nfeConsultas';
import {
  CAMPO_DA_COLUNA, COLUNAS_COMPLETAR, ROTULO_DA_COLUNA, chaveDaCelula, fraseDoEfeitoNoDre, pedidoDeCompletar,
  type AlvoDaPrevia, type CampoDaPrevia, type ColunaCompletar, type ResultadoCompletar, type ValoresParaTodas,
} from '@/lib/financeiro/nfe/notaCompletar';

/** O mock: Conta desmarcada por padrão (nas pagas ela nunca muda; na programada só se a pessoa marcar). P162: o Subcentro também — o
 *  sugerido é o último do fornecedor, nunca o deste lançamento; ele só muda se a pessoa marcar. */
const MARCADAS_DE_INICIO: ReadonlySet<ColunaCompletar> = new Set(COLUNAS_COMPLETAR.filter((c) => c !== 'conta' && c !== 'subcentro'));
const LARGURA: Record<ColunaCompletar, number> = { descricao: 150, favorecido: 120, fazenda: 100, conta: 96, subcentro: 130, documento: 104, competencia: 92, safra: 74 };
const dataBr = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : null);
/** O texto de um valor do campo: o nome (cadastro), a data dd/mm/aaaa ou o texto. */
const textoDo = (v: unknown, nome: string | null): string => nome && !/^[0-9a-f-]{36}$/.test(nome) ? nome : dataBr(v) ?? (v === null || v === undefined || v === '' ? '—' : String(v));
/** os campos sem os quais o lançamento fica incompleto: vazio aparece em destaque (P128b, prova da Alta Paulista) */
const OBRIGATORIAS: ReadonlySet<ColunaCompletar> = new Set<ColunaCompletar>(['favorecido', 'fazenda', 'conta', 'subcentro']);
const ROTULO_SITUACAO: Record<string, string> = { conciliada: 'conciliada', realizada: 'realizada', programada: 'programada' };

export function PreviaCompletar({ open, onFechar, clienteId, alvos, rotulos, todasIniciais, atualizarNaoPagas, juntar, chave, onConfirmar }: {
  open: boolean;
  onFechar: () => void;
  clienteId: string;
  /** os lançamentos achados, na ordem das parcelas (1..N) */
  alvos: readonly AlvoDaPrevia[];
  /** o rótulo de cada um na coluna "Parc." ("1/5"…), pelo id */
  rotulos: Readonly<Record<string, string>>;
  todasIniciais: ValoresParaTodas;
  /** o caminho 2: as programadas levam valor e vencimento da nota */
  atualizarNaoPagas: boolean;
  /** as soltas viram UMA compra parcelada (P96a) na mesma gravação */
  juntar: boolean;
  chave: string | null;
  /** grava (a sequência é de quem chama: as que faltam, a função, a nota, o registro). Devolve a frase do que impediu, ou `null`. */
  onConfirmar: (pedido: Record<string, unknown>[]) => Promise<string | null>;
}) {
  const [todas, setTodas] = useState<ValoresParaTodas>(todasIniciais);
  const [marcadas, setMarcadas] = useState<ReadonlySet<ColunaCompletar>>(MARCADAS_DE_INICIO);
  const [mantidas, setMantidas] = useState<ReadonlySet<string>>(new Set());
  const [previa, setPrevia] = useState<ResultadoCompletar | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pedido = useMemo(() => pedidoDeCompletar(alvos, todas, marcadas, mantidas, atualizarNaoPagas), [alvos, todas, marcadas, mantidas, atualizarNaoPagas]);
  /* a prévia do BANCO a cada mudança (a última resposta vence; a que chega atrasada é ignorada) */
  const pedidoSeq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const seq = ++pedidoSeq.current;
    setConferindo(true);
    const t = setTimeout(() => {
      void completarComANota(clienteId, pedido, { juntar, chave, simular: true }).then((r) => {
        if (seq !== pedidoSeq.current) return;
        setConferindo(false);
        if (r.ok === false) { setFalha(r.motivo); return; }
        setFalha(null); setPrevia(r.valor);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [open, clienteId, pedido, juntar, chave]);

  const linhaDe = (id: string) => previa?.linhas.find((l) => l.id === id) ?? null;
  const n = alvos.length;
  const recusas = previa?.recusas ?? [];
  const fraseDre = previa ? fraseDoEfeitoNoDre(previa.efeitoDre) : null;
  const podeGravar = !!previa && previa.ok && !falha && !conferindo && !gravando && recusas.length === 0;
  const rotuloDoBotao = juntar ? `Juntar as ${n}, padronizar e anexar` : atualizarNaoPagas ? `Atualizar as ${n} e anexar` : `Completar as ${n} e anexar`;
  const trocarMarca = (c: ColunaCompletar) => setMarcadas((m) => { const x = new Set(m); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const trocarCelula = (id: string, c: ColunaCompletar) => setMantidas((m) => { const k = chaveDaCelula(id, c); const x = new Set(m); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const gravar = async () => {
    setGravando(true); setErro(null);
    try { const e = await onConfirmar(pedido); if (e) setErro(e); } finally { setGravando(false); }
  };

  const celula = (id: string, c: ColunaCompletar, campo: CampoDaPrevia | undefined) => {
    if (!campo) return <span className="text-muted-foreground">—</span>;
    const hoje = textoDo(campo.hoje, campo.hojeNome);
    if (campo.cadeado) {
      return <span className="text-muted-foreground" title={`${hoje} · 🔒 ${campo.cadeado}`} data-testid="previa-cadeado">🔒 {hoje}</span>;
    }
    const mantida = mantidas.has(chaveDaCelula(id, c));
    /* o campo que todo lançamento precisa e que está VAZIO e assim fica (a 4/4 da Alta Paulista nasceu sem conta): destaque, nunca "— · igual" */
    if (!campo.muda && OBRIGATORIAS.has(c) && (campo.hoje === null || campo.hoje === undefined || campo.hoje === '')) {
      return (
        <span className="font-medium text-amber-700" title={`Este lançamento está sem ${ROTULO_DA_COLUNA[c]}: marque a coluna ${ROTULO_DA_COLUNA[c]} para completar.`}
          data-testid="previa-vazio">⚠ vazio</span>
      );
    }
    if (!campo.muda) {
      return (
        <button type="button" className="w-full min-w-0 truncate text-left text-muted-foreground" title={`${hoje} · igual${mantida ? ' (mantido nesta parcela — clique para usar o valor para todas)' : ''}`}
          onClick={() => trocarCelula(id, c)} disabled={!marcadas.has(c)} data-testid="previa-igual">
          {hoje} · {mantida ? 'mantido' : 'igual'}
        </button>
      );
    }
    const fica = textoDo(campo.fica, campo.ficaNome);
    return (
      <button type="button" className="w-full min-w-0 truncate text-left" title={`${hoje} → ${fica} (clique para manter o de hoje nesta parcela)`}
        onClick={() => trocarCelula(id, c)} data-testid="previa-muda">
        <s className="text-muted-foreground">{hoje}</s> → <span className="font-medium text-primary">{fica}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !gravando) onFechar(); }}>
      <DialogContent className="flex h-[min(600px,calc(100dvh-32px))] w-[min(1180px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="previa-completar">
        <div className="flex h-9 shrink-0 items-center bg-primary px-4 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">O que a nota muda em cada parcela</DialogTitle>
          <DialogDescription className="sr-only">Prévia campo a campo: o de hoje e o que fica, antes de gravar.</DialogDescription>
        </div>
        {/* o VALOR PARA TODAS (o que é desta prévia; o resto vem do bloco "Lançamento") */}
        <div className="grid shrink-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b px-4 py-2" data-testid="previa-para-todas">
          <div className="min-w-0">
            <span className={REGUA_ROTULO}>Descrição base · vira "base 1/{n} … {n}/{n}"</span>
            <Input value={todas.descricaoBase} onChange={(e) => setTodas((t) => ({ ...t, descricaoBase: e.target.value }))} className="h-[22px] text-[10.5px]"
              data-testid="previa-descricao-base" />
          </div>
          <div className="min-w-0">
            <span className={REGUA_ROTULO}>Nº documento</span>
            <Input value={todas.numeroDocumento} onChange={(e) => setTodas((t) => ({ ...t, numeroDocumento: e.target.value }))} className="h-[22px] text-[10.5px] tabular-nums"
              data-testid="previa-numero" />
          </div>
          <div className="min-w-0">
            <span className={REGUA_ROTULO}>Competência (= emissão)</span>
            <DatePicker value={todas.competencia ?? ''} onChange={(v) => setTodas((t) => ({ ...t, competencia: v || null }))} size="compact" data-testid="previa-competencia" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-2" data-testid="previa-rolagem">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 44 }} /><col style={{ width: 80 }} />{COLUNAS_COMPLETAR.map((c) => <col key={c} style={{ width: LARGURA[c] }} />)}
              {atualizarNaoPagas && <><col style={{ width: 76 }} /><col style={{ width: 84 }} /><col style={{ width: 92 }} /></>}</colgroup>
            <thead className="sticky top-0 z-10 bg-primary"><tr>
              <th className={TH_REGUA} title="Parcela">Parc.</th>
              <th className={TH_REGUA} title="Situação">Situação</th>
              {COLUNAS_COMPLETAR.map((c) => (
                <th key={c} className={TH_REGUA} title={`${ROTULO_DA_COLUNA[c]} — marcar = atualizar em todas`}>
                  <label className="flex min-w-0 cursor-pointer items-center gap-1">
                    <Checkbox checked={marcadas.has(c)} onCheckedChange={() => trocarMarca(c)} className="h-3 w-3 border-primary-foreground" data-testid={`previa-coluna-${c}`} />
                    <span className="min-w-0 truncate">{ROTULO_DA_COLUNA[c]}</span>
                  </label>
                </th>
              ))}
              {atualizarNaoPagas && <><th className={TH_REGUA} title="Vencimento de hoje">Venc.</th><th className={TH_REGUA} title="O vencimento que fica (🔒 = não muda)">Novo venc.</th><th className={cn(TH_REGUA, 'text-right')} title="Valor">Valor</th></>}
            </tr></thead>
            <tbody>
              {alvos.map((a) => {
                const l = linhaDe(a.id);
                return (
                  <tr key={a.id} className="border-b border-border/50" data-testid="previa-linha" data-situacao={l?.situacao ?? ''}>
                    <td className={cn(TD_REGUA_NUM, 'text-left')}>{rotulos[a.id] ?? '—'}</td>
                    <td className={TD_REGUA} title={l?.descricao ?? undefined}>{l ? ROTULO_SITUACAO[l.situacao] : '…'}</td>
                    {COLUNAS_COMPLETAR.map((c) => (
                      <td key={c} className={cn(TD_REGUA, !marcadas.has(c) && 'opacity-60')} data-coluna={c}>{l ? celula(a.id, c, l.campos[CAMPO_DA_COLUNA[c]]) : '…'}</td>
                    ))}
                    {atualizarNaoPagas && <>
                      {/* o gate de tela (regra "data"): a coluna Venc. só tem a data; o que fica e o 🔒 moram em "Novo venc." */}
                      <td className={cn(TD_REGUA, 'whitespace-nowrap')}>{l?.campos.data_vencimento ? (l.campos.data_vencimento.muda
                        ? <s className="text-muted-foreground">{dataBr(l.campos.data_vencimento.hoje) ?? '—'}</s>
                        : <span className="text-muted-foreground">{dataBr(l.campos.data_vencimento.hoje) ?? '—'}</span>) : '…'}</td>
                      <td className={cn(TD_REGUA, 'whitespace-nowrap')}>{l?.campos.data_vencimento ? (l.campos.data_vencimento.muda
                        ? <span className="font-medium text-primary" title="hoje → fica">{dataBr(l.campos.data_vencimento.fica) ?? '—'}</span>
                        : l.campos.data_vencimento.cadeado
                          ? <span className="text-muted-foreground" title={`🔒 ${l.campos.data_vencimento.cadeado}`} data-testid="previa-venc-cadeado">🔒 não muda</span>
                          : <span className="text-muted-foreground">igual</span>) : '…'}</td>
                      <td className={cn(TD_REGUA_NUM, 'whitespace-nowrap')}>{l?.campos.valor ? (l.campos.valor.muda
                        ? <span title="hoje → fica"><s className="text-muted-foreground">{reais(Math.round(Number(l.campos.valor.hoje) * 100))}</s> → <span className="font-medium text-primary">{reais(Math.round(Number(l.campos.valor.fica) * 100))}</span></span>
                        : <span className="text-muted-foreground">{reais(Math.round(Number(l.campos.valor.hoje) * 100))}{l.campos.valor.cadeado ? ' 🔒' : ''}</span>) : '…'}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* o que muda no DRE e o que impede (frase pronta do banco) — duas linhas reservadas */}
        <div className="h-[30px] shrink-0 overflow-hidden px-4 text-[10px] leading-[14px]" data-testid="previa-rodape-frase">
          {falha ? <span className="text-destructive" data-testid="previa-falha">Não consegui conferir a prévia ({falha}).</span>
            : recusas.length ? <span className="text-destructive" data-testid="previa-recusa">{recusas[0]}{recusas.length > 1 ? ` (+${recusas.length - 1})` : ''}</span>
            : erro ? <span className="text-destructive" data-testid="previa-erro">{erro}</span>
            : <span className="text-foreground" data-testid="previa-dre">{fraseDre ?? 'O DRE não muda (nem a classificação nem o mês de nenhuma parcela).'}</span>}
        </div>
        <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-t bg-muted/30 px-4">
          <span className="mr-auto text-[10px] text-muted-foreground">{conferindo ? 'Conferindo com o banco…' : 'Nada é gravado antes de você clicar.'}</span>
          <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[10.5px]" onClick={onFechar} disabled={gravando}>Voltar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[220px] px-2.5 text-[10.5px]" disabled={!podeGravar} onClick={() => { void gravar(); }}
            data-testid="previa-gravar">{gravando ? 'Gravando…' : rotuloDoBotao}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

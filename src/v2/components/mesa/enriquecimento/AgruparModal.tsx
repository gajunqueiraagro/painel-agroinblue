/**
 * AgruparModal — "N linhas da planilha = 1 movimento do banco" — [ENRIQUECER-MESA-06] (133i item 1).
 *
 * ⚠ O GESTO ERA CEGO E É IRREVERSÍVEL PELA TELA. A faixa roxa oferecia "Agrupar 3 linhas
 * neste lançamento" sobre um conjunto FECHADO — o `grupo_ids` que o casador gravou —, e
 * confirmar CANCELA um lançamento e cria outros três. Quando o casador acertava 2 de 3, não
 * havia gesto: o operador não tinha como incluir a terceira nem tirar a que sobrava.
 *
 * ⚠ A LISTA É O UNIVERSO, NÃO A SUGESTÃO: todas as linhas do MESMO DIA e da MESMA CONTA que
 * ainda não têm par. As sugeridas nascem marcadas; o resto, desmarcado. Medido no Proto: nos
 * grupos do NJ Pecuária o universo é de 5 linhas contra grupos de 2 a 5 — pequeno o bastante para
 * caber na tela e grande o bastante para a escolha existir.
 *
 * ⚠ O FILTRO DAQUI ESPELHA OS GUARDS DA RPC (d) e (f), e é isso que impede a tela de
 * oferecer o que o banco vai recusar: mesmo `match_status` elegível, sem `match_lancamento_ids`,
 * não aplicada, e conta compatível com a do lançamento. Oferecer uma linha que volta
 * `staging_invalido` seria pedir ao operador que descobrisse a regra por tentativa.
 *
 * ⚠ O BOTÃO SÓ ABRE COM DIFERENÇA ZERO, porque a RPC recusa `soma_divergente` fora de
 * ±0,005 — e recusar depois de confirmar um gesto irreversível é a pior hora de recusar.
 *
 * ⚠ CENTAVOS EM INTEIRO em toda a soma: é a diferença que decide se o botão abre.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { fmtBRL, fmtData } from './fmt';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

/** O movimento do banco — a linha fixa do topo. */
export interface MovimentoDoBanco {
  data: string | null;
  descricao: string | null;
  contaNome: string | null;
  valor: number | null;
  documento: string | null;
}

export interface AgruparModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  movimento: MovimentoDoBanco;
  /** As candidatas já peneiradas pelo container (mesmo dia, mesma conta, sem par). */
  candidatas: readonly ClassificacaoStagingPreviewRow[];
  /** O que o casador sugeriu — nasce marcado. */
  sugeridasIds: readonly string[];
  onConfirmar: (stagingIds: string[]) => Promise<void>;
  agrupando?: boolean;
}

const cent = (v: number | null | undefined): number => Math.round((Number(v) || 0) * 100);

export function AgruparModal({
  open, onOpenChange, movimento, candidatas, sugeridasIds, onConfirmar, agrupando,
}: AgruparModalProps) {
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set());

  /* ⚠ A MARCAÇÃO NASCE DA SUGESTÃO A CADA ABERTURA, e não uma vez só: reabrir o modal
     depois de mexer tem de recomeçar do que o casador propôs, não do que ficou da última
     vez — senão o operador herda uma escolha que não lembra de ter feito. */
  useEffect(() => {
    if (open) setMarcadas(new Set(sugeridasIds));
  }, [open, sugeridasIds]);

  /* ⚠ A CONTAGEM SAI DO MESMO CONJUNTO QUE A SOMA — PR-ENRIQ-AGRUPAR-01. Era
     `marcadas.size`, e a soma reduzia sobre `candidatas`: quando uma sugerida ficava de fora
     da lista, o cabeçalho dizia "5 marcadas" somando quatro, e a diferença de R$ 33,61
     aparecia sem nada na tela que a explicasse. Contar o que não se soma é pior que não
     contar. */
  const marcadasVisiveis = useMemo(
    () => candidatas.filter((r) => marcadas.has(r.staging_id)),
    [candidatas, marcadas]);
  const somaCent = useMemo(
    () => marcadasVisiveis.reduce((acc, r) => acc + cent(r.excel_valor), 0),
    [marcadasVisiveis]);
  const extratoCent = cent(movimento.valor);
  const difCent = somaCent - extratoCent;
  /* ±0,005 é a tolerância da RPC; em centavos inteiros, isso é diferença zero. */
  const confere = difCent === 0;
  const n = marcadasVisiveis.length;

  /* ⚠ BUSCA SOBRE A LISTA, NUNCA SOBRE A MARCAÇÃO: filtrar o que se vê não pode desmarcar o
     que já foi escolhido, senão procurar a sexta linha desfaz as cinco primeiras. */
  const [busca, setBusca] = useState('');
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return candidatas;
    return candidatas.filter((r) =>
      `${r.excel_fornecedor ?? ''} ${r.excel_produto ?? ''} ${r.excel_subcentro ?? ''} ${r.excel_valor ?? ''}`
        .toLowerCase().includes(q));
  }, [candidatas, busca]);

  const alternar = (id: string) => setMarcadas((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const idsParaAgrupar = useMemo(() => marcadasVisiveis.map((r) => r.staging_id), [marcadasVisiveis]);

  const motivoTravado = n < 2
    ? 'Marque pelo menos duas linhas.'
    : !confere
      ? `A soma das marcadas ${difCent > 0 ? 'passa' : 'falta'} ${fmtBRL(Math.abs(difCent) / 100)}.`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠ TAMANHO FIXO E UM SCROLLPORT SÓ (A21): só a lista rola; topo, movimento e rodapé
          ficam. Com o diálogo crescendo, o botão que confirma um gesto irreversível saía
          da tela justamente quando o operador terminava de escolher. */}
      <DialogContent className="flex h-[560px] max-h-[92vh] w-[900px] max-w-[96vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0 bg-primary px-3 py-2">
          <DialogTitle className="text-[13px] font-medium text-primary-foreground">
            Agrupar em um movimento do banco
          </DialogTitle>
        </DialogHeader>

        {/* ═══ OS TRÊS NÚMEROS ═══════════════════════════════════════════════════════ */}
        <div className="grid shrink-0 grid-cols-3 gap-3 border-b px-3 py-1.5">
          <div className="min-w-0">
            <div className="text-[10px] leading-tight text-muted-foreground">Extrato</div>
            <div className="truncate text-[20px] font-medium leading-tight tabular-nums">
              {fmtBRL(movimento.valor)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] leading-tight text-muted-foreground">
              Planilha · {n} marcada{n === 1 ? '' : 's'}
            </div>
            <div className="truncate text-[20px] font-medium leading-tight tabular-nums">
              {fmtBRL(somaCent / 100)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] leading-tight text-muted-foreground">Diferença</div>
            {/* ⚠ "confere" NO LUGAR DE "R$ 0,00": zero é um número, e o que o operador
                precisa ler é o veredito. O sinal fica quando não confere — passar e faltar
                pedem gestos opostos. */}
            <div className={`truncate text-[20px] font-medium leading-tight tabular-nums ${
              confere ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {confere ? 'confere' : `${difCent > 0 ? '+' : '−'}${fmtBRL(Math.abs(difCent) / 100)}`}
            </div>
          </div>
        </div>

        {/* ═══ O MOVIMENTO DO BANCO — linha fixa ═════════════════════════════════════ */}
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1 text-[11px]">
          <span className="shrink-0 tabular-nums text-muted-foreground">{fmtData(movimento.data)}</span>
          <span className="min-w-0 flex-1 truncate font-medium" title={movimento.descricao ?? ''}>
            {movimento.descricao || '—'}
          </span>
          <span className="shrink-0 truncate text-[10px] text-muted-foreground" title={movimento.contaNome ?? ''}>
            {movimento.contaNome || '—'}
          </span>
          <span className="shrink-0 tabular-nums font-medium">{fmtBRL(movimento.valor)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">doc {movimento.documento || '—'}</span>
        </div>

        {/* Busca — a sessão pode ter mais linhas do que cabem no olho. */}
        <div className="shrink-0 border-b px-3 py-1">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor, produto ou valor…"
            className="h-6 w-full rounded border bg-background px-2 text-[10px] outline-none focus-visible:ring-1"
            aria-label="Buscar linha da planilha"
          />
        </div>

        {/* ═══ AS CANDIDATAS — o único scrollport ════════════════════════════════════ */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {candidatas.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
              Nenhuma linha da mesma conta está sem par.
            </p>
          ) : visiveis.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
              Nenhuma linha casa com “{busca.trim()}”. As marcadas continuam marcadas.
            </p>
          ) : visiveis.map((r) => {
            const marcada = marcadas.has(r.staging_id);
            const sugerida = sugeridasIds.includes(r.staging_id);
            return (
              /* A18 — uma altura de 22px, tudo em uma linha, `truncate` em cada célula. */
              <label key={r.staging_id}
                className={`grid h-[22px] cursor-pointer items-center gap-2 border-b border-border/50 px-3 text-[10px] ${
                  marcada ? 'bg-primary/5' : ''}`}
                style={{ gridTemplateColumns: '16px 64px minmax(0,1.2fr) minmax(0,1fr) 90px 96px' }}>
                <Checkbox checked={marcada} onCheckedChange={() => alternar(r.staging_id)}
                  className="h-3 w-3" />
                <span className="truncate tabular-nums text-muted-foreground">{fmtData(r.excel_data)}</span>
                <span className="truncate text-[11px] font-medium" title={r.excel_fornecedor ?? ''}>
                  {r.excel_fornecedor || '—'}
                  {/* ⚠ A SUGESTÃO DO CASADOR FICA VISÍVEL depois de marcada: sem a pílula, o
                      operador que desmarcasse uma sugerida não teria como reencontrá-la. */}
                  {sugerida && (
                    <span className="ml-1 rounded bg-violet-100 px-1 text-[9px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                      sugerida
                    </span>
                  )}
                </span>
                <span className="truncate text-muted-foreground" title={r.excel_produto ?? ''}>
                  {r.excel_produto || '—'}
                </span>
                <span className="truncate text-muted-foreground" title={r.excel_documento ?? ''}>
                  doc {r.excel_documento || '—'}
                </span>
                <span className="truncate text-right text-[11px] font-medium tabular-nums">
                  {fmtBRL(r.excel_valor)}
                </span>
              </label>
            );
          })}
        </div>

        {/* ═══ RODAPÉ ════════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 border-t px-3 py-1 text-[10px] leading-tight text-muted-foreground">
          Vai criar <b className="tabular-nums">{n}</b> lançamentos e cancelar o consolidado
          (motivo: agrupamento); o vínculo do extrato passa para os <b className="tabular-nums">{n}</b> novos.
        </div>
        <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-t px-3">
          {motivoTravado && (
            <span className="mr-auto text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {motivoTravado}
            </span>
          )}
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]"
            onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm"
            className="h-7 bg-cta px-3 text-[11px] font-semibold text-cta-foreground hover:bg-cta-hover"
            disabled={!!motivoTravado || !!agrupando}
            title={motivoTravado ?? 'Cria uma linha por item, cancela o consolidado e religa o vínculo do extrato.'}
            /* ⚠ MANDA O QUE FOI SOMADO, não o `marcadas` cru: se um id marcado tiver saído
               da lista de candidatas, ele não entrou na conta e não pode entrar na gravação —
               a RPC o recusaria com `staging_invalido` depois de um gesto irreversível. */
            onClick={() => { void onConfirmar(idsParaAgrupar); }}>
            {agrupando ? 'Agrupando…' : `Agrupar ${n} linhas`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

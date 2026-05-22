import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Pencil, Undo2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCatalogoCliente } from '@/v2/lib/excelPreview/catalogoCliente';
import { sugerirTodasLinhas, type Sugestao } from '@/v2/lib/excelPreview/sugestaoEngine';
import type { LoteExcel, MatchResult, ExcelLinhaNormalizada } from '@/v2/lib/excelPreview/types';

interface AprovacaoLocal {
  aprovadoEm: string;
  contaSugeridaId: string | null;
  contaSugeridaRotulo: string | null;
  fazendaSugeridaId: string | null;
  fazendaSugeridaNome: string | null;
  subcentroSugerido: string;
  macroSugerido: string | null;
  grupoSugerido: string | null;
  centroSugerido: string | null;
  fornecedorOficialId: string | null;
  fornecedorOficialNome: string | null;
  ofxIdVinculado: string | null;
}

interface OfxItem {
  id: string;
  data_movimento: string;
  descricao: string;
  valor: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  contaNome: string;
  anoMes: string;          // 'YYYY-MM'
  saldoOfxResumo: string;  // já formatado
  naoExplicado: string;    // já formatado
  lotes: LoteExcel[];
  matches: Map<string, MatchResult>;
  extratos: OfxItem[];
}

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type FiltroMostrar = 'todos' | 'forte' | 'fraco' | 'sem_match' | 'aprovados' | 'nao_aprovados';
type FiltroOrdem = 'original' | 'score_desc' | 'data_asc';

export function MesaPareamentoModal({
  open, onOpenChange, clienteId, contaNome, anoMes,
  saldoOfxResumo, naoExplicado, lotes, matches, extratos,
}: Props) {
  const { data: catalogo, isLoading: catalogoCarregando, isError: catalogoErro } =
    useCatalogoCliente(clienteId);

  const linhasExcel = useMemo<ExcelLinhaNormalizada[]>(
    () => lotes.flatMap((l) => l.linhas),
    [lotes],
  );

  const sugestoes = useMemo<Map<string, Sugestao>>(
    () => (catalogo ? sugerirTodasLinhas(linhasExcel, catalogo) : new Map<string, Sugestao>()),
    [linhasExcel, catalogo],
  );

  const [aprovacoes, setAprovacoes] = useState<Map<string, AprovacaoLocal>>(new Map<string, AprovacaoLocal>());
  const [filtroMostrar, setFiltroMostrar] = useState<FiltroMostrar>('todos');
  const [filtroOrdem, setFiltroOrdem] = useState<FiltroOrdem>('original');
  const [linhaHover, setLinhaHover] = useState<string | null>(null);

  function aprovarLinha(excelKey: string) {
    const sug = sugestoes.get(excelKey);
    const mt = matches.get(excelKey);
    if (!sug) return;
    setAprovacoes((prev) => {
      const next = new Map<string, AprovacaoLocal>(prev);
      next.set(excelKey, {
        aprovadoEm: new Date().toISOString(),
        contaSugeridaId: sug.contaSugerida?.id ?? null,
        contaSugeridaRotulo: sug.contaSugerida?.rotulo ?? null,
        fazendaSugeridaId: sug.fazendaSugerida?.id ?? null,
        fazendaSugeridaNome: sug.fazendaSugerida?.nome ?? null,
        subcentroSugerido: sug.subcentroSugerido?.subcentro ?? '',
        macroSugerido: sug.subcentroSugerido?.macro_custo ?? null,
        grupoSugerido: sug.subcentroSugerido?.grupo_custo ?? null,
        centroSugerido: sug.subcentroSugerido?.centro_custo ?? null,
        fornecedorOficialId: sug.fornecedorOficial?.id ?? null,
        fornecedorOficialNome: sug.fornecedorOficial?.nome ?? null,
        ofxIdVinculado: mt?.ofxIdMatched ?? null,
      });
      return next;
    });
  }

  function desfazerLinha(excelKey: string) {
    setAprovacoes((prev) => {
      const next = new Map<string, AprovacaoLocal>(prev);
      next.delete(excelKey);
      return next;
    });
  }

  const linhasFiltradas = useMemo<ExcelLinhaNormalizada[]>(() => {
    let arr = linhasExcel.slice();
    arr = arr.filter((l) => {
      const k = `${l.loteId}:${l.indiceLinha}`;
      const m = matches.get(k);
      const ap = aprovacoes.has(k);
      switch (filtroMostrar) {
        case 'forte': return m?.faixa === 'forte';
        case 'fraco': return m?.faixa === 'fraco';
        case 'sem_match': return !m || m.faixa === 'nenhum';
        case 'aprovados': return ap;
        case 'nao_aprovados': return !ap;
        default: return true;
      }
    });
    if (filtroOrdem === 'score_desc') {
      arr.sort((a, b) => {
        const sa = matches.get(`${a.loteId}:${a.indiceLinha}`)?.score ?? 0;
        const sb = matches.get(`${b.loteId}:${b.indiceLinha}`)?.score ?? 0;
        return sb - sa;
      });
    } else if (filtroOrdem === 'data_asc') {
      arr.sort((a, b) => {
        const da = a.dataPagamento ?? a.dataCompetencia ?? '';
        const db = b.dataPagamento ?? b.dataCompetencia ?? '';
        return da.localeCompare(db);
      });
    }
    return arr;
  }, [linhasExcel, matches, aprovacoes, filtroMostrar, filtroOrdem]);

  const totalAprovados = aprovacoes.size;
  const ofxDestaqueIds = useMemo<Set<string>>(() => {
    if (!linhaHover) return new Set<string>();
    const m = matches.get(linhaHover);
    return new Set<string>(m?.ofxIdMatched ? [m.ofxIdMatched] : []);
  }, [linhaHover, matches]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 flex flex-col">
        <DialogHeader className="p-3 border-b shrink-0">
          <DialogTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
            <span>Mesa de Pareamento — {contaNome} · {anoMes}</span>
            <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
              <span>Saldo OFX entr./saí.: {saldoOfxResumo}</span>
              <span className="text-rose-700 font-medium">Não explicado: {naoExplicado}</span>
              <span className="text-emerald-700 font-medium">✓ {totalAprovados} aprovados (memória)</span>
            </div>
          </DialogTitle>
          <div className="flex items-center gap-2 text-xs pt-2 flex-wrap">
            <span className="text-muted-foreground">Mostrar:</span>
            <Select value={filtroMostrar} onValueChange={(v) => setFiltroMostrar(v as FiltroMostrar)}>
              <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos ({linhasExcel.length})</SelectItem>
                <SelectItem value="forte">Forte</SelectItem>
                <SelectItem value="fraco">Fraco</SelectItem>
                <SelectItem value="sem_match">Sem match</SelectItem>
                <SelectItem value="aprovados">Aprovados</SelectItem>
                <SelectItem value="nao_aprovados">Não aprovados</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground ml-2">Ordenar:</span>
            <Select value={filtroOrdem} onValueChange={(v) => setFiltroOrdem(v as FiltroOrdem)}>
              <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="score_desc">Score desc</SelectItem>
                <SelectItem value="data_asc">Data asc</SelectItem>
              </SelectContent>
            </Select>
            {catalogoCarregando && (
              <span className="text-muted-foreground ml-2">Carregando catálogo do cliente…</span>
            )}
            {catalogoErro && (
              <span className="text-rose-600 ml-2">Erro carregando catálogo</span>
            )}
            {catalogo && (
              <span className="text-muted-foreground ml-2">
                Catálogo: {catalogo.contas.length} contas · {catalogo.fazendas.length} fazendas ·
                {' '}{catalogo.subcentros.length} subcentros · {catalogo.fornecedores.length} fornecedores
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-[1fr_1fr_1.2fr] gap-2 p-2">
          {/* COLUNA 1 — OFX REAL */}
          <Card className="p-2 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1 shrink-0">
              OFX real ({extratos.length} movs)
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {extratos.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-xs border-l-[3px] rounded-r',
                    ofxDestaqueIds.has(e.id)
                      ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-l-transparent hover:bg-muted/30',
                  )}
                >
                  <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                    {format(new Date(e.data_movimento + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                  </span>
                  <span className="flex-1 truncate text-foreground">{e.descricao}</span>
                  <span className={cn('tabular-nums shrink-0 font-medium',
                    e.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
                  )}>{fmtBRL(e.valor)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* COLUNA 2 — EXCEL / HIPÓTESE */}
          <Card className="p-2 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1 shrink-0">
              Excel ({linhasFiltradas.length} de {linhasExcel.length} linhas)
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {linhasFiltradas.map((linha) => {
                const key = `${linha.loteId}:${linha.indiceLinha}`;
                const m = matches.get(key);
                const faixa = m?.faixa ?? 'nenhum';
                const data = linha.dataPagamento ?? linha.dataCompetencia;
                const valorSinalizado = (linha.sinal === 'entrada' ? 1 : -1) * (linha.valorCentavos / 100);
                const aprovado = aprovacoes.has(key);
                return (
                  <div
                    key={key}
                    onMouseEnter={() => setLinhaHover(key)}
                    onMouseLeave={() => setLinhaHover(null)}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 text-xs border-l-[3px] rounded-r',
                      faixa === 'forte' ? 'border-l-blue-500' :
                      faixa === 'fraco' ? 'border-l-amber-500' :
                      'border-l-rose-500',
                      aprovado && 'bg-emerald-50/50 dark:bg-emerald-950/20',
                      linhaHover === key && 'bg-muted',
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                      {data ? format(new Date(data + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}
                    </span>
                    <span className="flex-1 truncate">
                      {linha.fornecedor || <span className="italic text-muted-foreground">{linha.subcentro}</span>}
                    </span>
                    <span className={cn('tabular-nums shrink-0 font-medium',
                      linha.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                    )}>{fmtBRL(valorSinalizado)}</span>
                    <Badge
                      variant={faixa === 'forte' ? 'default' :
                               faixa === 'fraco' ? 'secondary' : 'destructive'}
                      className="text-[9px] h-4 px-1.5 shrink-0"
                    >{m?.score ?? 0}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* COLUNA 3 — IA SUGERE */}
          <Card className="p-2 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1 shrink-0">
              IA sugere ({sugestoes.size} sugestões)
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {linhasFiltradas.map((linha) => {
                const key = `${linha.loteId}:${linha.indiceLinha}`;
                const sug = sugestoes.get(key);
                const aprovado = aprovacoes.has(key);
                return (
                  <div
                    key={key}
                    onMouseEnter={() => setLinhaHover(key)}
                    onMouseLeave={() => setLinhaHover(null)}
                    className={cn(
                      'border rounded p-1.5 text-[11px] space-y-0.5',
                      aprovado && 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300',
                      linhaHover === key && !aprovado && 'bg-muted',
                    )}
                  >
                    {!sug ? (
                      <div className="text-muted-foreground italic">Sem sugestão</div>
                    ) : (
                      <>
                        <SugLinha label="Conta" valor={sug.contaSugerida?.rotulo}
                                  conf={sug.contaSugerida?.confianca} />
                        <SugLinha label="Fazenda" valor={sug.fazendaSugerida?.nome}
                                  conf={sug.fazendaSugerida?.confianca} />
                        <SugLinha label="Subc." valor={sug.subcentroSugerido?.subcentro}
                                  conf={sug.subcentroSugerido?.confianca} />
                        {sug.subcentroSugerido && (
                          <div className="text-[10px] text-muted-foreground pl-12">
                            {sug.subcentroSugerido.macro_custo ?? '—'} /
                            {' '}{sug.subcentroSugerido.grupo_custo ?? '—'} /
                            {' '}{sug.subcentroSugerido.centro_custo ?? '—'}
                          </div>
                        )}
                        <SugLinha label="Forn." valor={sug.fornecedorOficial?.nome}
                                  conf={sug.fornecedorOficial?.confianca} />
                        {sug.alertas.length > 0 && (
                          <div className="flex items-center gap-1 text-amber-700 text-[10px]">
                            <AlertTriangle className="h-3 w-3" />
                            {sug.alertas.join(' · ')}
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-1 pt-1">
                      {aprovado ? (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                                onClick={() => desfazerLinha(key)}>
                          <Undo2 className="h-3 w-3 mr-1" /> Desfazer
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="default" className="h-6 text-[10px]"
                                  disabled={!sug}
                                  onClick={() => aprovarLinha(key)}>
                            <Check className="h-3 w-3 mr-1" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px]"
                                  disabled title="Disponível no PR4">
                            <Pencil className="h-3 w-3 mr-1" /> Corrigir
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SugLinha({ label, valor, conf }: {
  label: string;
  valor: string | null | undefined;
  conf: number | undefined;
}) {
  if (!valor) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground w-10 shrink-0">{label}:</span>
        <span className="text-muted-foreground italic">—</span>
      </div>
    );
  }
  const pct = conf != null ? Math.round(conf * 100) : null;
  const corPct = pct != null && pct >= 80 ? 'text-emerald-700'
              : pct != null && pct >= 50 ? 'text-amber-700'
              : 'text-rose-700';
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground w-10 shrink-0">{label}:</span>
      <span className="truncate flex-1">{valor}</span>
      {pct != null && <span className={cn('text-[10px] tabular-nums shrink-0', corPct)}>{pct}%</span>}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Check, X, ArrowLeftRight, ArrowRight, Undo2, AlertTriangle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCatalogoCliente } from '@/v2/lib/excelPreview/catalogoCliente';
import { sugerirTodasLinhas, type Sugestao } from '@/v2/lib/excelPreview/sugestaoEngine';
import type { LoteExcel, MatchResult, ExcelLinhaNormalizada } from '@/v2/lib/excelPreview/types';

type DecisaoStatus = 'pendente' | 'aprovado' | 'rejeitado' | 'excel_orfao';

interface ParEstado {
  excelKey: string;
  ofxIdAtivo: string | null;
  ofxIdSugeridoOriginal: string | null;
  decisao: DecisaoStatus;
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
  contaId: string;
  anoMes: string;
  saldoOfxResumo: string;
  naoExplicado: string;
  lotes: LoteExcel[];
  matches: Map<string, MatchResult>;
  extratos: OfxItem[];
}

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type FiltroMostrar = 'todos' | 'forte' | 'fraco' | 'sem_match'
                   | 'pendentes' | 'aprovados' | 'rejeitados' | 'orfaos';
type FiltroOrdem = 'score_desc' | 'valor_desc' | 'valor_asc' | 'data_asc' | 'data_desc' | 'original';

export function MesaPareamentoModal({
  open, onOpenChange, clienteId, contaNome, contaId, anoMes,
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

  // Estado de pares: inicializa com ofxIdAtivo = sugerido pelo engine, decisao pendente.
  // Lazy init: roda só na primeira render do modal.
  const [pares, setPares] = useState<Map<string, ParEstado>>(() => {
    const m = new Map<string, ParEstado>();
    linhasExcel.forEach((l) => {
      const key = `${l.loteId}:${l.indiceLinha}`;
      const mt = matches.get(key);
      m.set(key, {
        excelKey: key,
        ofxIdAtivo: mt?.ofxIdMatched ?? null,
        ofxIdSugeridoOriginal: mt?.ofxIdMatched ?? null,
        decisao: 'pendente',
      });
    });
    return m;
  });

  const [parAtivoKey, setParAtivoKey] = useState<string | null>(null);
  const [filtroMostrar, setFiltroMostrar] = useState<FiltroMostrar>('todos');
  const [filtroOrdem, setFiltroOrdem] = useState<FiltroOrdem>('score_desc');

  // ---------- ações de decisão ----------

  function aprovarPar(key: string) {
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'aprovado' });
      return next;
    });
  }
  function rejeitarPar(key: string) {
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'rejeitado' });
      return next;
    });
  }
  function marcarExcelOrfao(key: string) {
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'excel_orfao', ofxIdAtivo: null });
      return next;
    });
  }
  function desfazer(key: string) {
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, decisao: 'pendente' });
      return next;
    });
  }
  function trocarOfx(key: string, novoOfxId: string) {
    setPares((prev) => {
      const next = new Map<string, ParEstado>(prev);
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, ofxIdAtivo: novoOfxId, decisao: 'pendente' });
      return next;
    });
  }

  // ---------- derivações ----------

  // OFX consumidos (vinculados a pares aprovados)
  const ofxConsumidos = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    pares.forEach((p) => {
      if (p.decisao === 'aprovado' && p.ofxIdAtivo) s.add(p.ofxIdAtivo);
    });
    return s;
  }, [pares]);

  // Contadores
  const contadores = useMemo(() => {
    let aprovados = 0, rejeitados = 0, orfaos = 0, pendentes = 0;
    pares.forEach((p) => {
      if (p.decisao === 'aprovado') aprovados++;
      else if (p.decisao === 'rejeitado') rejeitados++;
      else if (p.decisao === 'excel_orfao') orfaos++;
      else pendentes++;
    });
    const bancoOrfao = extratos.length - ofxConsumidos.size;
    return { aprovados, rejeitados, orfaos, pendentes, bancoOrfao };
  }, [pares, ofxConsumidos, extratos.length]);

  // Lista filtrada e ordenada
  const linhasFiltradas = useMemo<ExcelLinhaNormalizada[]>(() => {
    let arr = linhasExcel.slice();

    arr = arr.filter((l) => {
      const key = `${l.loteId}:${l.indiceLinha}`;
      const p = pares.get(key);
      const m = matches.get(key);
      switch (filtroMostrar) {
        case 'forte': return m?.faixa === 'forte';
        case 'fraco': return m?.faixa === 'fraco';
        case 'sem_match': return !m || m.faixa === 'nenhum';
        case 'pendentes': return p?.decisao === 'pendente';
        case 'aprovados': return p?.decisao === 'aprovado';
        case 'rejeitados': return p?.decisao === 'rejeitado';
        case 'orfaos': return p?.decisao === 'excel_orfao';
        default: return true;
      }
    });

    if (filtroOrdem === 'score_desc') {
      arr.sort((a, b) => {
        const sa = matches.get(`${a.loteId}:${a.indiceLinha}`)?.score ?? 0;
        const sb = matches.get(`${b.loteId}:${b.indiceLinha}`)?.score ?? 0;
        return sb - sa;
      });
    } else if (filtroOrdem === 'valor_desc') {
      arr.sort((a, b) => b.valorCentavos - a.valorCentavos);
    } else if (filtroOrdem === 'valor_asc') {
      arr.sort((a, b) => a.valorCentavos - b.valorCentavos);
    } else if (filtroOrdem === 'data_asc') {
      arr.sort((a, b) => {
        const da = a.dataPagamento ?? a.dataCompetencia ?? '';
        const db = b.dataPagamento ?? b.dataCompetencia ?? '';
        return da.localeCompare(db);
      });
    } else if (filtroOrdem === 'data_desc') {
      arr.sort((a, b) => {
        const da = a.dataPagamento ?? a.dataCompetencia ?? '';
        const db = b.dataPagamento ?? b.dataCompetencia ?? '';
        return db.localeCompare(da);
      });
    }
    return arr;
  }, [linhasExcel, matches, pares, filtroMostrar, filtroOrdem]);

  // Linha Excel ativa
  const linhaAtiva = useMemo<ExcelLinhaNormalizada | null>(() => {
    if (!parAtivoKey) return null;
    return linhasExcel.find((l) => `${l.loteId}:${l.indiceLinha}` === parAtivoKey) ?? null;
  }, [parAtivoKey, linhasExcel]);

  const parAtivo = parAtivoKey ? pares.get(parAtivoKey) ?? null : null;
  const matchAtivo = parAtivoKey ? matches.get(parAtivoKey) ?? null : null;
  const sugAtiva = parAtivoKey ? sugestoes.get(parAtivoKey) ?? null : null;
  const ofxAtivo = parAtivo?.ofxIdAtivo
    ? extratos.find((e) => e.id === parAtivo.ofxIdAtivo) ?? null
    : null;

  // Alertas adicionais
  const alertasExtras = useMemo<string[]>(() => {
    if (!linhaAtiva) return [];
    const out: string[] = [];
    // Conta sugerida ≠ conta visualizada
    if (sugAtiva?.contaSugerida && sugAtiva.contaSugerida.id !== contaId) {
      out.push(`Conta sugerida (${sugAtiva.contaSugerida.rotulo}) ≠ conta atual (${contaNome})`);
    }
    // Sinal incoerente Excel ↔ OFX
    if (ofxAtivo) {
      const ofxPositivo = ofxAtivo.valor > 0;
      const ofxNegativo = ofxAtivo.valor < 0;
      if (
        (linhaAtiva.sinal === 'entrada' && ofxNegativo) ||
        (linhaAtiva.sinal === 'saida' && ofxPositivo)
      ) {
        out.push('Sinal Excel ↔ OFX incoerente');
      }
      // Diferença de dias > 3
      const dataExcel = linhaAtiva.dataPagamento ?? linhaAtiva.dataCompetencia;
      if (dataExcel) {
        const d = Math.abs(
          (new Date(dataExcel + 'T12:00:00').getTime()
           - new Date(ofxAtivo.data_movimento + 'T12:00:00').getTime()) / 86400000,
        );
        if (d > 3) out.push(`Diferença de ${Math.round(d)} dias entre Excel e OFX`);
      }
    }
    return out;
  }, [linhaAtiva, sugAtiva, ofxAtivo, contaId, contaNome]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1800px] h-[92vh] max-h-[92vh] p-0 flex flex-col">
        <DialogHeader className="p-3 border-b shrink-0">
          <DialogTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
            <span>Mesa de Pareamento — {contaNome} · {anoMes}</span>
            <div className="flex items-center gap-3 text-xs font-normal flex-wrap">
              <span className="text-muted-foreground">OFX entr./saí.: {saldoOfxResumo}</span>
              <span className="text-rose-700 font-medium">Não explicado: {naoExplicado}</span>
              <span className="text-emerald-700">✓ {contadores.aprovados} aprov.</span>
              <span className="text-rose-700">✗ {contadores.rejeitados} rej.</span>
              <span className="text-amber-700">→ {contadores.orfaos} excel órf.</span>
              <span className="text-muted-foreground">— {contadores.pendentes} pend.</span>
              <span className="text-muted-foreground">| banco órf.: {contadores.bancoOrfao}</span>
            </div>
          </DialogTitle>
          <div className="flex items-center gap-2 text-xs pt-2 flex-wrap">
            <span className="text-muted-foreground">Mostrar:</span>
            <Select value={filtroMostrar} onValueChange={(v) => setFiltroMostrar(v as FiltroMostrar)}>
              <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos ({linhasExcel.length})</SelectItem>
                <SelectItem value="forte">Forte</SelectItem>
                <SelectItem value="fraco">Fraco</SelectItem>
                <SelectItem value="sem_match">Sem match</SelectItem>
                <SelectItem value="pendentes">Pendentes</SelectItem>
                <SelectItem value="aprovados">Aprovados</SelectItem>
                <SelectItem value="rejeitados">Rejeitados</SelectItem>
                <SelectItem value="orfaos">Excel órfãos</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground ml-2">Ordenar:</span>
            <Select value={filtroOrdem} onValueChange={(v) => setFiltroOrdem(v as FiltroOrdem)}>
              <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="score_desc">Score desc</SelectItem>
                <SelectItem value="valor_desc">Valor desc</SelectItem>
                <SelectItem value="valor_asc">Valor asc</SelectItem>
                <SelectItem value="data_asc">Data asc</SelectItem>
                <SelectItem value="data_desc">Data desc</SelectItem>
                <SelectItem value="original">Original</SelectItem>
              </SelectContent>
            </Select>
            {catalogoCarregando && (
              <span className="text-muted-foreground ml-2">Carregando catálogo…</span>
            )}
            {catalogoErro && (
              <span className="text-rose-600 ml-2">Erro carregando catálogo</span>
            )}
            {catalogo && (
              <span className="text-muted-foreground ml-2">
                Catálogo: {catalogo.contas.length} contas · {catalogo.fazendas.length} fazendas ·
                {' '}{catalogo.subcentros.length} subc · {catalogo.fornecedores.length} fornec.
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-[1fr_1.4fr_1fr] gap-2 p-2">

          {/* COL 1 — LISTA DE PARES */}
          <Card className="p-2 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground px-1 pb-1 shrink-0">
              Pares ({linhasFiltradas.length} de {linhasExcel.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {linhasFiltradas.map((linha) => {
                const key = `${linha.loteId}:${linha.indiceLinha}`;
                const p = pares.get(key);
                const m = matches.get(key);
                const faixa = m?.faixa ?? 'nenhum';
                const data = linha.dataPagamento ?? linha.dataCompetencia;
                const valorSinalizado = (linha.sinal === 'entrada' ? 1 : -1) * (linha.valorCentavos / 100);
                const ativo = parAtivoKey === key;
                const decisao = p?.decisao ?? 'pendente';

                const corDecisao =
                  decisao === 'aprovado' ? 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20' :
                  decisao === 'rejeitado' ? 'border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20' :
                  decisao === 'excel_orfao' ? 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20' :
                  faixa === 'forte' ? 'border-l-blue-500' :
                  faixa === 'fraco' ? 'border-l-amber-500' :
                  'border-l-rose-500';

                const iconeDecisao =
                  decisao === 'aprovado' ? '✓' :
                  decisao === 'rejeitado' ? '✗' :
                  decisao === 'excel_orfao' ? '→' :
                  '—';

                return (
                  <button
                    key={key}
                    onClick={() => setParAtivoKey(key)}
                    className={cn(
                      'w-full flex items-center gap-1.5 px-2 py-1.5 text-xs border-l-[3px] rounded-r text-left',
                      corDecisao,
                      ativo && 'ring-2 ring-primary ring-inset bg-muted',
                    )}
                  >
                    <span className="shrink-0 w-3 text-center">{iconeDecisao}</span>
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
                  </button>
                );
              })}
            </div>
          </Card>

          {/* COL 2 — DETALHE DO PAR ATIVO */}
          <Card className="p-3 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground pb-2 shrink-0">
              Detalhe do par
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {!parAtivo || !linhaAtiva ? (
                <div className="text-center text-muted-foreground italic py-12">
                  Selecione um par na lista à esquerda
                </div>
              ) : (
                <>
                  {/* OFX vinculado */}
                  <div className="border rounded p-2.5 space-y-1 bg-muted/30">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">
                      OFX vinculado
                    </div>
                    {!ofxAtivo ? (
                      <div className="text-xs italic text-muted-foreground">Nenhum OFX vinculado</div>
                    ) : (
                      <>
                        <div className="text-xs flex items-center gap-3">
                          <span className="tabular-nums text-muted-foreground">
                            {format(new Date(ofxAtivo.data_movimento + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                          </span>
                          <span className={cn('tabular-nums font-bold',
                            ofxAtivo.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
                          )}>{fmtBRL(ofxAtivo.valor)}</span>
                        </div>
                        <div className="text-xs">{ofxAtivo.descricao}</div>
                      </>
                    )}
                  </div>

                  {/* Excel */}
                  <div className="border rounded p-2.5 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">
                      Excel
                    </div>
                    <div className="text-xs flex items-center gap-3">
                      <span className="tabular-nums text-muted-foreground">
                        {linhaAtiva.dataPagamento
                          ? format(new Date(linhaAtiva.dataPagamento + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                          : (linhaAtiva.dataCompetencia
                              ? `comp. ${format(new Date(linhaAtiva.dataCompetencia + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`
                              : '—')}
                      </span>
                      <span className={cn('tabular-nums font-bold',
                        linhaAtiva.sinal === 'entrada' ? 'text-emerald-600' : 'text-rose-600',
                      )}>{fmtBRL((linhaAtiva.sinal === 'entrada' ? 1 : -1) * (linhaAtiva.valorCentavos / 100))}</span>
                    </div>
                    <div className="text-xs"><strong>Forn.:</strong> {linhaAtiva.fornecedor || '—'}</div>
                    <div className="text-xs"><strong>Conta:</strong> {linhaAtiva.contaTexto || '—'}</div>
                    <div className="text-xs"><strong>Fazenda:</strong> {linhaAtiva.fazendaTexto || '—'}</div>
                    <div className="text-xs"><strong>Subc.:</strong> {linhaAtiva.subcentro || '—'}</div>
                    {linhaAtiva.observacao && (
                      <div className="text-xs"><strong>Obs:</strong> {linhaAtiva.observacao}</div>
                    )}
                  </div>

                  {/* Alertas */}
                  {(alertasExtras.length > 0 || (sugAtiva && sugAtiva.alertas.length > 0)) && (
                    <div className="border border-amber-300 rounded p-2 space-y-1 bg-amber-50/30 dark:bg-amber-950/10">
                      <div className="text-[10px] font-bold uppercase text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Alertas
                      </div>
                      {alertasExtras.map((a, i) => (
                        <div key={`ae-${i}`} className="text-[11px] text-amber-800">⚠ {a}</div>
                      ))}
                      {sugAtiva?.alertas.map((a, i) => (
                        <div key={`as-${i}`} className="text-[11px] text-amber-800">⚠ {a}</div>
                      ))}
                    </div>
                  )}

                  {/* Score */}
                  {matchAtivo && matchAtivo.faixa !== 'nenhum' && (
                    <div className="text-[10px] text-muted-foreground border-t pt-2">
                      Score: <strong>{matchAtivo.score}</strong> ({matchAtivo.faixa})
                      {matchAtivo.detalheScore.diasDistancia != null && (
                        <span> · {Math.abs(matchAtivo.detalheScore.diasDistancia)} dia(s) de distância</span>
                      )}
                      <span> · similaridade nome {(matchAtivo.detalheScore.similaridadeNome * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* COL 3 — SUGESTÃO + DECISÃO */}
          <Card className="p-3 flex flex-col overflow-hidden">
            <div className="text-[10px] font-bold uppercase text-muted-foreground pb-2 shrink-0">
              IA sugere + Decisão
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {!parAtivo || !sugAtiva ? (
                <div className="text-center text-muted-foreground italic py-12">
                  Selecione um par para ver a sugestão e decidir
                </div>
              ) : (
                <>
                  <div className="space-y-1 text-[11px]">
                    <SugLinha label="Conta" valor={sugAtiva.contaSugerida?.rotulo}
                              conf={sugAtiva.contaSugerida?.confianca} />
                    <SugLinha label="Fazenda" valor={sugAtiva.fazendaSugerida?.nome}
                              conf={sugAtiva.fazendaSugerida?.confianca} />
                    <SugLinha label="Subc." valor={sugAtiva.subcentroSugerido?.subcentro}
                              conf={sugAtiva.subcentroSugerido?.confianca} />
                    {sugAtiva.subcentroSugerido && (
                      <div className="text-[10px] text-muted-foreground pl-14">
                        {sugAtiva.subcentroSugerido.macro_custo ?? '—'} /
                        {' '}{sugAtiva.subcentroSugerido.grupo_custo ?? '—'} /
                        {' '}{sugAtiva.subcentroSugerido.centro_custo ?? '—'}
                      </div>
                    )}
                    <SugLinha label="Forn." valor={sugAtiva.fornecedorOficial?.nome}
                              conf={sugAtiva.fornecedorOficial?.confianca} />
                  </div>

                  {/* Botões de decisão */}
                  <div className="border-t pt-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Decisão</div>
                    {parAtivo.decisao === 'pendente' ? (
                      <>
                        <Button size="sm" variant="default" className="w-full justify-start text-xs h-8"
                                onClick={() => parAtivoKey && aprovarPar(parAtivoKey)}
                                disabled={!parAtivo.ofxIdAtivo}>
                          <Check className="h-3.5 w-3.5 mr-2" /> Aprovar par
                        </Button>
                        <Button size="sm" variant="destructive" className="w-full justify-start text-xs h-8"
                                onClick={() => parAtivoKey && rejeitarPar(parAtivoKey)}>
                          <X className="h-3.5 w-3.5 mr-2" /> Rejeitar (sugestão errada)
                        </Button>
                        <PopoverOutroOfx
                          extratos={extratos}
                          ofxConsumidos={ofxConsumidos}
                          ofxAtualId={parAtivo.ofxIdAtivo}
                          onEscolher={(novoId) => parAtivoKey && trocarOfx(parAtivoKey, novoId)}
                        />
                        <Button size="sm" variant="outline" className="w-full justify-start text-xs h-8"
                                onClick={() => parAtivoKey && marcarExcelOrfao(parAtivoKey)}>
                          <ArrowRight className="h-3.5 w-3.5 mr-2" /> Marcar Excel órfão
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="w-full justify-start text-xs h-8"
                              onClick={() => parAtivoKey && desfazer(parAtivoKey)}>
                        <Undo2 className="h-3.5 w-3.5 mr-2" /> Desfazer ({parAtivo.decisao})
                      </Button>
                    )}
                  </div>
                </>
              )}
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
        <span className="text-muted-foreground w-12 shrink-0">{label}:</span>
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
      <span className="text-muted-foreground w-12 shrink-0">{label}:</span>
      <span className="truncate flex-1">{valor}</span>
      {pct != null && <span className={cn('text-[10px] tabular-nums shrink-0', corPct)}>{pct}%</span>}
    </div>
  );
}

function PopoverOutroOfx({ extratos, ofxConsumidos, ofxAtualId, onEscolher }: {
  extratos: OfxItem[];
  ofxConsumidos: Set<string>;
  ofxAtualId: string | null;
  onEscolher: (id: string) => void;
}) {
  const [busca, setBusca] = useState<string>('');
  const filtrados = useMemo<OfxItem[]>(() => {
    const q = busca.toLowerCase().trim();
    return extratos.filter((e) =>
      e.id !== ofxAtualId &&
      !ofxConsumidos.has(e.id) &&
      (!q || e.descricao.toLowerCase().includes(q)),
    );
  }, [extratos, busca, ofxAtualId, ofxConsumidos]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="w-full justify-start text-xs h-8">
          <ArrowLeftRight className="h-3.5 w-3.5 mr-2" /> Outro OFX…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-2" align="start">
        <div className="flex items-center gap-1 pb-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição…"
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto space-y-0.5">
          {filtrados.slice(0, 100).map((e) => (
            <button
              key={e.id}
              onClick={() => onEscolher(e.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-left"
            >
              <span className="text-[10px] text-muted-foreground tabular-nums w-12 shrink-0">
                {format(new Date(e.data_movimento + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
              </span>
              <span className="flex-1 truncate">{e.descricao}</span>
              <span className={cn('tabular-nums shrink-0 font-medium',
                e.valor >= 0 ? 'text-emerald-600' : 'text-rose-600',
              )}>{fmtBRL(e.valor)}</span>
            </button>
          ))}
          {filtrados.length === 0 && (
            <div className="text-xs italic text-muted-foreground py-3 text-center">
              Sem candidatos
            </div>
          )}
          {filtrados.length > 100 && (
            <div className="text-[10px] italic text-muted-foreground py-1 text-center">
              Exibindo 100 de {filtrados.length} — refine a busca
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

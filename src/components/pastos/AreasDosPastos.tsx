/**
 * PASTO-AREA-OFICIAL-01 · tela — modo "Áreas" no cadastro de pastos: a área OFICIAL do mês × a área do MAPA, a diferença (ha e %),
 * ordenável, com seleção em lote e o "Usar área do mapa" (regra 1 do plano de 01/11, Gabriel).
 *
 * ⚠ A área do mapa é MEDIÇÃO: o banco mede o polígono gravado. Adotar é gesto: os marcados → o modal com a PRÉVIA do banco (antes × mapa e
 * a lotação UA/ha antes × depois, pasto a pasto) → motivo → grava SÓ o que a prévia mostrou (tudo ou nada). Vale do MÊS escolhido em
 * diante (o atual ou o anterior, se aberto), nunca para trás; o mês travado vem com a frase do banco e a caixa apagada com o motivo.
 * ⚠ Desfazer: a última mudança do pasto volta à área de antes (prévia + motivo); a trilha fica no banco.
 * ⚠ LAYOUT FIXO: a faixa de cima (mês · contagem · botão) e o rodapé dos totais ficam sempre; o botão tem o lugar reservado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { formatarAreaBR } from '@/lib/areaBR';
import { cn } from '@/lib/utils';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { QUADRO_REGUA, RODAPE_REGUA, TH_REGUA } from '@/components/ui/regua-tabela';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  API_AREA_OFICIAL, mesesOferecidos, podeUsarMapa, porQueNaoMarca, soma,
  type ApiAreaOficial, type LinhaDeArea, type PreviaDoDesfazer, type PreviaDoMapa,
} from '@/lib/pastos/areaOficial';

type Coluna = 'nome' | 'oficial' | 'mapa' | 'difHa' | 'difPct' | 'ultima';
const COLUNAS: readonly ColunaOrdenavel<LinhaDeArea, Coluna>[] = [
  { coluna: 'nome', tipo: 'texto', valor: (l) => l.nome },
  { coluna: 'oficial', tipo: 'numero', valor: (l) => l.oficial },
  { coluna: 'mapa', tipo: 'numero', valor: (l) => l.mapa },
  { coluna: 'difHa', tipo: 'numero', valor: (l) => l.difHa },
  { coluna: 'difPct', tipo: 'numero', valor: (l) => l.difPct },
  { coluna: 'ultima', tipo: 'texto', valor: (l) => l.ultimaDesde },
];
/* PASTO-FICHA-01 PR B (pedido 3) — o cabeçalho navy da régua, PRESO: só o corpo rola, dentro do quadro */
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary');
const ROTULO_ORIGEM: Record<string, string> = { mapa: 'do mapa', manual: 'à mão', cadastro: 'no cadastro' };
const mesBR = (am: string) => `${am.slice(5, 7)}/${am.slice(0, 4)}`;
const ha = (v: number | null) => formatarAreaBR(v) || '—';
const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const difHa = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${formatarAreaBR(v)}`);
const ua = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function AreasDosPastos({ fazendaId, fazendaCodigo, podeEditar, api = API_AREA_OFICIAL, hoje = hojeLocal(), aoGravar }: {
  fazendaId: string;
  fazendaCodigo: string | null;
  podeEditar: boolean;
  api?: ApiAreaOficial;
  hoje?: string;
  /** depois de gravar: a tela de pastos relê o cadastro (a área de hoje mudou) */
  aoGravar: () => void;
}) {
  const [mesAnterior, mesAtual] = mesesOferecidos(hoje);
  const [mes, setMes] = useState(mesAtual);
  const [linhas, setLinhas] = useState<LinhaDeArea[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [usando, setUsando] = useState(false);
  const [desfazendo, setDesfazendo] = useState<LinhaDeArea | null>(null);

  const ler = useCallback(async () => {
    setCarregando(true);
    const r = await api.comparar(fazendaId, mes);
    setCarregando(false);
    if (r.ok) { setLinhas(r.dados); setErro(null); } else setErro(r.erro);
  }, [api, fazendaId, mes]);
  useEffect(() => { setMarcados(new Set()); void ler(); }, [ler]);

  const { ordem, alternar, ordenadas } = useOrdenacaoTabela(linhas, COLUNAS, { coluna: 'difPct', direcao: 'asc' });
  const marcaveis = useMemo(() => linhas.filter(podeUsarMapa), [linhas]);
  const nMarcados = marcados.size;
  const todos = marcaveis.length > 0 && marcaveis.every((l) => marcados.has(l.pastoId));
  const alternarUm = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodos = () => setMarcados(todos ? new Set() : new Set(marcaveis.map((l) => l.pastoId)));
  const quadro = useAlturaAteOFim({ folga: 12, minimo: 240 });
  const depoisDeGravar = () => { setUsando(false); setDesfazendo(null); setMarcados(new Set()); void ler(); aoGravar(); };

  return (
    <div className="space-y-1" data-testid="areas-dos-pastos">
      {/* a faixa: rótulo + mês (lugar fixo) · o vão · o botão (largura fixa, sempre no lugar). A regra mora no `title` do rótulo: frase
          fora de tabela não corta com "…" (P104) */}
      <div className="flex h-[26px] items-center gap-2">
        <span className="flex-none cursor-help text-[11px] font-semibold text-muted-foreground"
          title="A área oficial é a do cadastro (lotação, fechamento, DRE); a do mapa é a medição do polígono. Adotar vale do mês escolhido em diante, nunca para trás.">
          Área oficial × mapa · a partir de
        </span>
        <Segmentado altura={22} valor={mes} onEscolher={setMes} opcoes={[
          { valor: mesAnterior, rotulo: mesBR(mesAnterior), title: 'a área nova vale deste mês em diante, se ele estiver aberto' },
          { valor: mesAtual, rotulo: mesBR(mesAtual), title: 'a área nova vale deste mês em diante' },
        ]} />
        <span className="min-w-0 flex-1" />
        {podeEditar && (
          <Button size="sm" className="h-6 w-[190px] flex-none px-2 text-[10px]" disabled={nMarcados === 0} onClick={() => setUsando(true)}
            title={nMarcados === 0 ? 'marque os pastos que vão usar a área do mapa' : undefined} data-testid="areas-usar-mapa">
            Usar área do mapa{nMarcados > 0 ? ` · ${nMarcados}` : ''}
          </Button>
        )}
      </div>
      {erro && <p className="text-[11px] text-destructive" data-testid="areas-erro">{erro}</p>}
      <div ref={quadro.ref} className={QUADRO_REGUA} style={{ height: quadro.altura }} data-testid="areas-quadro">
      <div className="min-h-0 flex-1 overflow-auto" style={{ scrollbarGutter: 'stable' }} data-tabela-que-rola="">
        <table className="w-full table-fixed text-[10px]" data-testid="areas-tabela">
          <colgroup>
            <col style={{ width: 28 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 76 }} />
            <col style={{ width: 64 }} /><col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>
                {podeEditar && (
                  <Checkbox checked={todos} onCheckedChange={alternarTodos} disabled={marcaveis.length === 0} className="h-3.5 w-3.5 align-middle border-primary-foreground"
                    aria-label="Marcar todos os que podem usar a área do mapa" title="Marcar todos os que podem usar a área do mapa" data-testid="areas-marcar-todos" />
                )}
              </th>
              <ThOrdenavel coluna="nome" rotulo="Pasto" ordem={ordem} onOrdenar={alternar} className={TH} />
              <ThOrdenavel coluna="oficial" rotulo="Oficial (ha)" ordem={ordem} onOrdenar={alternar} className={TH} alinhaDireita />
              <ThOrdenavel coluna="mapa" rotulo="Mapa (ha)" ordem={ordem} onOrdenar={alternar} className={TH} alinhaDireita />
              <ThOrdenavel coluna="difHa" rotulo="Dif. (ha)" ordem={ordem} onOrdenar={alternar} className={TH} alinhaDireita />
              <ThOrdenavel coluna="difPct" rotulo="Dif. (%)" ordem={ordem} onOrdenar={alternar} className={TH} alinhaDireita />
              <ThOrdenavel coluna="ultima" rotulo="Última mudança" ordem={ordem} onOrdenar={alternar} className={TH} />
            </tr>
          </thead>
          <tbody>
            {!carregando && ordenadas.length === 0 && !erro && (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground" data-testid="areas-vazio">Nenhum pasto ativo neste mês.</td></tr>
            )}
            {ordenadas.map((l, i) => {
              const motivo = porQueNaoMarca(l);
              const forte = l.difPct != null && Math.abs(l.difPct) >= 20;
              const ultima = l.ultimaOrigem && l.ultimaDesde ? `${ROTULO_ORIGEM[l.ultimaOrigem]} · desde ${mesBR(l.ultimaDesde)}` : '';
              return (
                <tr key={l.pastoId} className={`border-b last:border-b-0 ${i % 2 ? 'bg-muted/30' : ''}`} data-testid="areas-linha">
                  <td className="h-[19px] px-1 py-0">
                    {podeEditar && (
                      <Checkbox checked={marcados.has(l.pastoId)} onCheckedChange={() => alternarUm(l.pastoId)} disabled={!!motivo}
                        className="h-3.5 w-3.5 align-middle" aria-label={`Marcar ${l.nome}`} title={motivo ?? `Marcar ${l.nome}`} data-testid="areas-marcar" />
                    )}
                  </td>
                  {/* o `title` é o texto INTEIRO da célula (o gate confere a reticência contra ele); o motivo da trava mora na caixa */}
                  <td className="truncate h-[19px] px-1 py-0 font-medium" title={l.trava ? `${l.nome} · travado` : l.nome}>
                    {l.nome}{l.trava && <span className="font-normal text-muted-foreground">{' · travado'}</span>}
                  </td>
                  <td className="h-[19px] px-1 py-0 text-right tabular-nums">{ha(l.oficial)}</td>
                  <td className="h-[19px] px-1 py-0 text-right tabular-nums" title={l.nPoligonos === 0 ? 'sem polígono no mapa' : undefined}>{ha(l.mapa)}</td>
                  <td className={`h-[19px] px-1 py-0 text-right tabular-nums ${forte ? 'font-semibold text-amber-700' : ''}`}>{difHa(l.difHa)}</td>
                  <td className={`h-[19px] px-1 py-0 text-right tabular-nums ${forte ? 'font-semibold text-amber-700' : ''}`}>{pct(l.difPct)}</td>
                  <td className="h-[19px] px-1 py-0">
                    <div className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={ultima || undefined}>{ultima}</span>
                      {podeEditar && l.ultimaId && (
                        <button type="button" className="flex-none text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
                          disabled={!!l.trava} title={l.trava ? `a área não muda: ${l.trava}` : `Voltar para ${ha(l.ultimaAnterior)} ha`}
                          onClick={() => setDesfazendo(l)} data-testid="areas-desfazer">Desfazer</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* o rodapé PRESO no pé do quadro (régua): tabela própria, o mesmo colgroup, fora da rolagem */}
      <div className={RODAPE_REGUA} style={{ scrollbarGutter: 'stable' }}>
        <table className="w-full table-fixed text-[10px]">
          <colgroup>
            <col style={{ width: 28 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 76 }} />
            <col style={{ width: 64 }} /><col style={{ width: 150 }} />
          </colgroup>
          <tbody>
            <tr className="font-semibold" data-testid="areas-rodape">
              <td />
              <td className="h-[22px] px-1 py-0">{linhas.length} pasto{linhas.length === 1 ? '' : 's'}</td>
              <td className="h-[22px] px-1 py-0 text-right tabular-nums">{ha(soma(linhas, 'oficial'))}</td>
              <td className="h-[22px] px-1 py-0 text-right tabular-nums">{ha(soma(linhas.filter((l) => l.mapa != null), 'mapa'))}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
      </div>
      {usando && (
        <UsarMapaDialog api={api} fazendaCodigo={fazendaCodigo} mes={mes} pastoIds={[...marcados]}
          aoFechar={() => setUsando(false)} aoGravar={depoisDeGravar} />
      )}
      {desfazendo && (
        <DesfazerDialog api={api} linha={desfazendo} aoFechar={() => setDesfazendo(null)} aoGravar={depoisDeGravar} />
      )}
    </div>
  );
}

/* ── "Usar área do mapa": a prévia do banco e o motivo ────────────────────────────────────────────────────────────────────────── */

function UsarMapaDialog({ api, fazendaCodigo, mes, pastoIds, aoFechar, aoGravar }: {
  api: ApiAreaOficial; fazendaCodigo: string | null; mes: string; pastoIds: string[]; aoFechar: () => void; aoGravar: () => void;
}) {
  const [previa, setPrevia] = useState<PreviaDoMapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [faltaMotivo, setFaltaMotivo] = useState(false);
  const [gravando, setGravando] = useState(false);

  /* a chave em texto: a lista chega nova a cada render da tela, e a prévia só se refaz se os pastos mudarem */
  const chave = pastoIds.join(',');
  useEffect(() => {
    let vivo = true;
    void api.usarMapa(chave.split(','), mes, 'prévia', true).then((r) => {
      if (!vivo) return;
      if (r.ok) setPrevia(r.dados); else setErro(r.erro);
    });
    return () => { vivo = false; };
  }, [api, chave, mes]);

  const pode = !!previa && previa.ok && !gravando;
  const gravar = async () => {
    if (!pode) return;
    if (!motivo.trim()) { setFaltaMotivo(true); return; }
    setGravando(true);
    const r = await api.usarMapa(pastoIds, mes, motivo.trim(), false);
    setGravando(false);
    if (!r.ok) { setErro(r.erro); return; }
    toast.success(`${r.dados.nMuda} pasto${r.dados.nMuda === 1 ? '' : 's'} com a área do mapa de ${mesBR(mes)} em diante.`);
    aoGravar();
  };
  const frase = erro ?? (!previa ? 'Conferindo no banco' : previa.nRecusa > 0
    ? `${previa.nRecusa} pasto${previa.nRecusa === 1 ? '' : 's'} não pode${previa.nRecusa === 1 ? '' : 'm'} usar a área do mapa (veja a linha). Desmarque e tente de novo.`
    : previa.nMuda === 0 ? 'Nada a mudar: a área oficial já é a do mapa.'
      : `${previa.nMuda} pasto${previa.nMuda === 1 ? '' : 's'} passa${previa.nMuda === 1 ? '' : 'm'} a usar a área do mapa de ${mesBR(mes)} em diante; os meses antes não mudam.`);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) aoFechar(); }}>
      <DialogContent className="max-w-3xl h-[470px] max-h-[92vh] p-0 flex flex-col gap-0" data-testid="areas-dialog">
        <DialogHeader className="px-4 py-2.5 border-b shrink-0">
          <DialogTitle className="text-sm font-semibold">
            Usar a área do mapa · a partir de {mesBR(mes)}{fazendaCodigo ? <span className="font-normal text-muted-foreground"> · {fazendaCodigo}</span> : null}
          </DialogTitle>
          <DialogDescription className="sr-only">Prévia da troca da área oficial pela área do mapa</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <div className="min-h-0 flex-1 overflow-auto rounded border bg-card">
            <table className="w-full table-fixed text-[10px]" data-testid="areas-previa">
              <colgroup><col /><col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 70 }} /><col style={{ width: 84 }} /><col style={{ width: 84 }} /><col style={{ width: 150 }} /></colgroup>
              <thead><tr className="bg-muted text-muted-foreground">
                <th className="sticky top-0 bg-muted px-2 py-1 text-left font-semibold">Pasto</th>
                <th className="sticky top-0 bg-muted px-2 py-1 text-right font-semibold">Antes (ha)</th>
                <th className="sticky top-0 bg-muted px-2 py-1 text-right font-semibold">Mapa (ha)</th>
                <th className="sticky top-0 bg-muted px-2 py-1 text-right font-semibold">Dif. (%)</th>
                <th className="sticky top-0 bg-muted px-2 py-1 text-right font-semibold">UA/ha antes</th>
                <th className="sticky top-0 bg-muted px-2 py-1 text-right font-semibold">UA/ha depois</th>
                <th className="sticky top-0 bg-muted px-2 py-1 text-left font-semibold">Situação</th>
              </tr></thead>
              <tbody>
                {(previa?.itens ?? []).map((i) => {
                  const sit = i.situacao === 'muda' ? 'muda' : i.motivo ?? (i.situacao === 'igual' ? 'já é a do mapa' : 'recusa');
                  return (
                    <tr key={i.pastoId} className="border-t" data-testid="areas-previa-linha">
                      <td className="truncate px-2 py-0.5 font-medium" title={i.nome}>{i.nome}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{ha(i.antes)}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{ha(i.mapa)}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{pct(i.difPct)}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums" title={i.lotacaoMes ? `lotação de ${mesBR(i.lotacaoMes)}` : 'sem lotação no mês'}>{ua(i.uaHaAntes)}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums" title={i.lotacaoMes ? `lotação de ${mesBR(i.lotacaoMes)}` : 'sem lotação no mês'}>{ua(i.uaHaDepois)}</td>
                      <td className={`truncate px-2 py-0.5 ${i.situacao === 'recusa' ? 'text-destructive' : i.situacao === 'igual' ? 'text-muted-foreground' : ''}`} title={sit}>{sit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* a frase em lugar fixo (2 linhas): quebra, não empurra */}
          <p className={`h-[30px] shrink-0 overflow-hidden text-[11px] leading-[15px] ${erro || (previa && previa.nRecusa > 0) ? 'text-destructive' : 'text-foreground'}`}
            title={frase} data-testid="areas-previa-frase">{frase}</p>
          <div className="shrink-0">
            <label className="text-[10px] font-semibold text-muted-foreground" htmlFor="areas-motivo">Motivo *</label>
            <Input id="areas-motivo" value={motivo} onChange={(e) => { setMotivo(e.target.value); setFaltaMotivo(false); }} maxLength={200}
              placeholder="Ex.: o mapa foi medido com GPS" className={`h-7 text-xs ${faltaMotivo ? 'border-destructive' : ''}`} data-testid="areas-motivo" />
            <p className="h-[13px] text-[10px] text-destructive">{faltaMotivo ? 'Informe o motivo.' : ''}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={aoFechar} disabled={gravando}>Cancelar</Button>
          <Button size="sm" className="h-7 w-[150px] text-xs" onClick={gravar} disabled={!pode} data-testid="areas-gravar">
            {gravando ? 'Gravando' : 'Usar área do mapa'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── desfazer a última mudança do pasto ────────────────────────────────────────────────────────────────────────────────────── */

function DesfazerDialog({ api, linha, aoFechar, aoGravar }: { api: ApiAreaOficial; linha: LinhaDeArea; aoFechar: () => void; aoGravar: () => void }) {
  const [previa, setPrevia] = useState<PreviaDoDesfazer | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [faltaMotivo, setFaltaMotivo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const id = linha.ultimaId ?? '';

  useEffect(() => {
    let vivo = true;
    void api.desfazer([id], 'prévia', true).then((r) => { if (!vivo) return; if (r.ok) setPrevia(r.dados); else setErro(r.erro); });
    return () => { vivo = false; };
  }, [api, id]);

  const item = previa?.itens[0];
  const pode = !!previa && previa.ok && !gravando;
  const gravar = async () => {
    if (!pode) return;
    if (!motivo.trim()) { setFaltaMotivo(true); return; }
    setGravando(true);
    const r = await api.desfazer([id], motivo.trim(), false);
    setGravando(false);
    if (!r.ok) { setErro(r.erro); return; }
    toast.success(`${linha.nome}: a área voltou para ${ha(item?.voltaPara ?? null)} ha.`);
    aoGravar();
  };
  const frase = erro ?? (!previa ? 'Conferindo no banco' : item?.recusa ? `Não dá para desfazer: ${item.recusa}.`
    : `${linha.nome} volta de ${ha(item?.area ?? null)} ha para ${ha(item?.voltaPara ?? null)} ha${linha.ultimaDesde ? ` desde ${mesBR(linha.ultimaDesde)}` : ''}. A mudança fica na trilha.`);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) aoFechar(); }}>
      <DialogContent className="flex h-[196px] w-[460px] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="areas-desfazer-dialog">
        <DialogHeader className="px-4 py-2.5 border-b shrink-0">
          <DialogTitle className="text-sm font-semibold">Desfazer a mudança de área</DialogTitle>
          <DialogDescription className="sr-only">{frase}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-1 bg-muted p-2">
          <p className={`h-[30px] overflow-hidden text-[11px] leading-[15px] ${erro || item?.recusa ? 'text-destructive' : ''}`} title={frase} data-testid="areas-desfazer-frase">{frase}</p>
          <Input value={motivo} onChange={(e) => { setMotivo(e.target.value); setFaltaMotivo(false); }} placeholder="motivo" maxLength={200}
            className={`h-7 text-xs ${faltaMotivo ? 'border-destructive' : ''}`} data-testid="areas-desfazer-motivo" />
          <p className="h-[13px] text-[10px] text-destructive">{faltaMotivo ? 'Informe o motivo.' : ''}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={aoFechar} disabled={gravando}>Voltar</Button>
          <Button size="sm" className="h-7 w-[110px] text-xs" onClick={gravar} disabled={!pode} data-testid="areas-desfazer-gravar">
            {gravando ? 'Gravando' : 'Desfazer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

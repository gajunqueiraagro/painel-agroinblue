/**
 * FECH-PASTO-UNIDADE-01 F2b (Gabriel 08/11: D1 a · D2 a · D3 a · D4 a; mock fech-pasto-unidade.html estado 6) — "É piquete de outro pasto…":
 * pastos soltos de hoje viram os PIQUETES de um pasto novo, a partir de um mês. O banco faz tudo numa transação (`fn_pastos_viram_piquetes`,
 * 117490): o pasto de hoje termina no mês anterior e nasce o piquete com a área, a ficha e o desenho dele; os cards desde o início passam ao
 * pasto novo (marcados por piquete); os vazios saem com o antes na trilha. A prévia é a do banco (o gesto inteiro, desfeito). O contorno é a
 * união dos desenhos pela MESMA lib do mapa (`unirVarios`). Desfazer: `fn_pastos_viram_piquetes_desfazer` pela rodada (`DesfazerPiquetes`).
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BlocoFormulario, CorpoFormulario } from '@/components/ui/bloco-formulario';
import { formatNum } from '@/lib/calculos/formatters';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { unirVarios } from '@/lib/mapa/edicaoDoPoligono';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';

export interface PastoParaArrumar {
  id: string;
  nome: string;
  /** a área do cadastro (quem chama passa: o cadastro de pastos lê a área de hoje — PASTO-AREA-OFICIAL-02a) */
  area_ha: number | null;
  ativo: boolean;
  data_fim?: string | null;
  grupo_id?: string | null;
  pai_id?: string | null;
}

const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** os meses que se escolhem para o início: do mês de hoje para trás, 12 meses ("nov/2026") */
export function mesesDoInicio(hoje: string): { value: string; label: string }[] {
  const [a, m] = hoje.slice(0, 7).split('-').map(Number);
  return Array.from({ length: 12 }, (_v, i) => {
    const d = new Date(a, m - 1 - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value: v, label: `${NOMES[d.getMonth()]}/${d.getFullYear()}` };
  });
}

/** quem pode virar piquete: ativo, sem fim, solto (sem grupo) e que não é pai nem piquete */
export const podeVirarPiquete = (p: PastoParaArrumar, pais: ReadonlySet<string>) => p.ativo && !p.data_fim && !p.grupo_id && !p.pai_id && !pais.has(p.id);

type Previa = { frase: string; mantidos: { ano_mes: string; cabecas: number }[]; saem: { ano_mes: string }[] };

export function ArrumarPiquetesDialog({ pastoInicial, pastos, geometrias, pais, onFechar, aoGravar }: {
  pastoInicial: PastoParaArrumar;
  pastos: readonly PastoParaArrumar[];
  geometrias: readonly FazendaGeometria[];
  /** os pastos que já têm piquetes (não entram como piquete) */
  pais: ReadonlySet<string>;
  onFechar: () => void;
  aoGravar: () => void;
}) {
  const [escolhidos, setEscolhidos] = useState<string[]>([pastoInicial.id]);
  const [nomes, setNomes] = useState<Record<string, string>>({ [pastoInicial.id]: pastoInicial.nome });
  const [nomePai, setNomePai] = useState('');
  const meses = useMemo(() => mesesDoInicio(hojeLocal()), []);
  const [inicio, setInicio] = useState(meses[0].value);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const porId = useMemo(() => new Map(pastos.map((p) => [p.id, p])), [pastos]);
  const lista = escolhidos.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; });
  const areaTotal = lista.reduce((s, p) => s + (p.area_ha ?? 0), 0);
  const opcoes = pastos.filter((p) => podeVirarPiquete(p, pais) && !escolhidos.includes(p.id))
    .map((p) => ({ value: p.id, label: p.nome, hint: p.area_ha ? `${formatNum(p.area_ha, 1)} ha` : undefined }));

  /* o contorno: a união dos desenhos (todos desenhados) pela lib do mapa; nenhum desenhado = sem contorno; parte = o banco recusa e diz */
  const contorno = useMemo((): { geojson: GeoJSON.Polygon | null; frase: string | null } => {
    const desenhos = escolhidos.flatMap((id) => geometrias.filter((g) => g.pasto_id === id).map((g) => ({ id: g.id, nome: porId.get(id)?.nome ?? '', geojson: g.geojson })));
    if (desenhos.length === 0) return { geojson: null, frase: null };
    if (desenhos.length < escolhidos.length || escolhidos.length < 2) return { geojson: null, frase: null };
    const r = unirVarios(desenhos);
    return r.ok ? { geojson: r.valor.geojson, frase: null }
      : { geojson: null, frase: 'Os desenhos não fecham numa peça só: encaixe as divisas no mapa (Validação) antes.' };
  }, [escolhidos, geometrias, porId]);

  /* qualquer mudança no formulário invalida a prévia */
  useEffect(() => { setPrevia(null); setErro(null); }, [escolhidos, nomes, nomePai, inicio]);

  const chamar = async (simular: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora do `types.ts` (a exceção do zero-cast)
    return (supabase as any).rpc('fn_pastos_viram_piquetes', {
      p_pastos: escolhidos, p_nome_pai: nomePai, p_inicio: `${inicio}-01`, p_nomes: escolhidos.map((id) => nomes[id] ?? ''),
      p_contorno: contorno.geojson, p_simular: simular,
    });
  };
  const verPrevia = async () => {
    setErro(null); setGravando(true);
    try {
      const { data, error } = await chamar(true);
      if (error) { setErro(error.message || 'Não consegui fazer a prévia.'); return; }
      setPrevia({ frase: String(data?.frase ?? ''), mantidos: Array.isArray(data?.mantidos) ? data.mantidos : [], saem: Array.isArray(data?.saem) ? data.saem : [] });
    } finally { setGravando(false); }
  };
  const confirmar = async () => {
    setErro(null); setGravando(true);
    try {
      const { error } = await chamar(false);
      if (error) { setErro(error.message || 'Não consegui gravar.'); return; }
      aoGravar();
      onFechar();
    } finally { setGravando(false); }
  };

  const mesLabel = meses.find((m) => m.value === inicio)?.label ?? inicio;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onFechar(); }}>
      <DialogContent className="flex h-[520px] max-h-[92vh] max-w-2xl flex-col gap-0 p-0" data-testid="arrumar-piquetes">
        <DialogHeader className="shrink-0 border-b px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Arrumar cadastro · os pastos viram piquetes</DialogTitle>
          <DialogDescription className="text-[11px]">Vale de {mesLabel} em diante; os meses antes ficam como estão.</DialogDescription>
        </DialogHeader>
        <CorpoFormulario className="min-h-0 flex-1 overflow-hidden">
          <BlocoFormulario titulo="Pasto" dica="o pasto que fica no fechamento, com a área somada">
            <div className="flex items-center gap-2">
              <Input value={nomePai} onChange={(e) => setNomePai(e.target.value)} placeholder="Nome do pasto novo" className="h-7 w-[200px] text-xs" data-testid="nome-do-pai" />
              <span className="text-[11px] text-muted-foreground">Início</span>
              <SearchableSelect value={inicio} options={meses} onValueChange={(v) => v && setInicio(v)} semTodos allValue="" allLabel="" placeholder="Mês"
                triggerClassName="h-7 w-[120px] text-xs" />
              <span className="ml-auto whitespace-nowrap text-[11px] tabular-nums text-muted-foreground" data-testid="area-do-pai">{formatNum(areaTotal, 2)} ha</span>
            </div>
          </BlocoFormulario>
          <BlocoFormulario titulo="Piquetes" acao={
            <SearchableSelect value="" allValue="" semTodos allLabel="+ Escolher pasto" placeholder="Buscar pasto" options={opcoes} disabled={opcoes.length === 0}
              onValueChange={(v) => { if (v) { setEscolhidos((e) => [...e, v]); setNomes((n) => ({ ...n, [v]: porId.get(v)?.nome ?? '' })); } }} triggerClassName="h-6 w-[150px] text-[11px]" />
          }>
            <table className="w-full table-fixed border-collapse text-[11px] tabular-nums" data-testid="tabela-dos-piquetes">
              <colgroup><col style={{ width: 150 }} /><col style={{ width: 70 }} /><col /><col style={{ width: 28 }} /></colgroup>
              <thead><tr className="text-left text-[9.5px] text-muted-foreground"><th className="px-1 font-medium">Hoje</th><th className="px-1 text-right font-medium">Área ha</th><th className="px-1 font-medium">Fica como</th><th /></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="h-[26px] border-t border-border/60">
                    <td className="truncate px-1" title={p.nome}>{p.nome}</td>
                    <td className="whitespace-nowrap px-1 text-right">{p.area_ha ? formatNum(p.area_ha, 2) : '—'}</td>
                    <td className="px-1"><Input value={nomes[p.id] ?? ''} onChange={(e) => setNomes((n) => ({ ...n, [p.id]: e.target.value }))} className="h-6 text-[11px]" data-testid="nome-do-piquete" /></td>
                    <td className="px-1 text-right">
                      {p.id !== pastoInicial.id && (
                        <button type="button" title={`Tirar ${p.nome}`} className="text-muted-foreground hover:text-destructive" onClick={() => setEscolhidos((e) => e.filter((x) => x !== p.id))}><X className="h-3 w-3" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BlocoFormulario>
          <BlocoFormulario titulo="Prévia" testId="previa-dos-piquetes">
            <p className="h-[60px] overflow-hidden text-[11px] leading-[15px]" data-testid="frase-da-previa">
              {previa ? previa.frase
                : contorno.frase ? contorno.frase
                : escolhidos.length < 2 ? 'Escolha pelo menos mais um pasto para virar piquete.'
                : 'Veja a prévia antes de gravar. Nada é apagado: dá para desfazer.'}
            </p>
          </BlocoFormulario>
        </CorpoFormulario>
        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-red-600" title={erro ?? undefined} data-testid="erro-dos-piquetes">{erro}</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onFechar} disabled={gravando}>Cancelar</Button>
          {previa ? (
            <Button size="sm" className="h-7 text-[11px]" onClick={confirmar} disabled={gravando} data-testid="confirmar-piquetes">{gravando ? 'Gravando...' : 'Confirmar'}</Button>
          ) : (
            <Button size="sm" className="h-7 text-[11px]" onClick={verPrevia} data-testid="ver-previa-piquetes"
              disabled={gravando || escolhidos.length < 2 || !nomePai.trim() || !!contorno.frase}>Ver prévia</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** o desfazer do pai criado pelo gesto: a rodada vem da trilha (`audit_log` 'pastos_viram_piquetes'); prévia do banco → Confirmar */
export async function rodadaDoPai(paiId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela fora do `types.ts` gerado para este filtro jsonb
  const { data, error } = await (supabase as any).from('audit_log').select('registro_id, dados_novos')
    .eq('acao', 'pastos_viram_piquetes').eq('tabela_origem', 'pasto_unidade').eq('dados_novos->>pai', paiId).limit(1);
  if (error) { console.error(error); return null; }
  return Array.isArray(data) && data[0]?.registro_id ? String(data[0].registro_id) : null;
}

export function DesfazerPiquetesDialog({ rodada, nomeDoPai, onFechar, aoGravar }: { rodada: string; nomeDoPai: string; onFechar: () => void; aoGravar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [frase, setFrase] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const chamar = (simular: boolean) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora do `types.ts` (a exceção do zero-cast)
    (supabase as any).rpc('fn_pastos_viram_piquetes_desfazer', { p_rodada: rodada, p_motivo: motivo, p_simular: simular });
  const passo = async () => {
    setErro(null); setGravando(true);
    try {
      const { data, error } = await chamar(frase === null);
      if (error) { setErro(error.message || 'Não consegui desfazer.'); return; }
      if (frase === null) { setFrase(String(data?.frase ?? '')); return; }
      aoGravar(); onFechar();
    } finally { setGravando(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onFechar(); }}>
      <DialogContent className="flex h-[300px] max-w-md flex-col gap-0 p-0" data-testid="desfazer-piquetes">
        <DialogHeader className="shrink-0 border-b px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Voltar {nomeDoPai} a pastos soltos</DialogTitle>
          <DialogDescription className="text-[11px]">Os pastos de antes voltam a valer, com os cards e os desenhos de antes.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 px-5 py-3">
          <Input value={motivo} onChange={(e) => { setMotivo(e.target.value); setFrase(null); }} placeholder="Motivo (obrigatório)" className="h-7 text-xs" data-testid="motivo-desfazer" />
          <p className="h-[60px] overflow-hidden text-[11px] leading-[15px]" data-testid="frase-desfazer">{frase ?? 'Veja a prévia antes de gravar.'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-red-600" title={erro ?? undefined}>{erro}</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onFechar} disabled={gravando}>Cancelar</Button>
          <Button size="sm" className="h-7 text-[11px]" onClick={passo} disabled={gravando || !motivo.trim()} data-testid="passo-desfazer">{frase === null ? 'Ver prévia' : 'Confirmar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

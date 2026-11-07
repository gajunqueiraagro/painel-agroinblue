/**
 * MAPA-PIQUETES-02 (Gabriel 01/11/2026) — os piquetes na visão VALIDAÇÃO, um módulo próprio (o encaixe no painel do polígono é pequeno,
 * ao lado do "Classificar" do Code 6 e do "Editar polígono" do Code 3):
 *  - `MarcarPiquete`: no painel do polígono, "É piquete de…" → o pasto-pai do cadastro; o polígono fica EM ESPERA (nada grava);
 *  - `PiquetesEmEspera`: a espera agrupada por pai, "Tirar" e "Concluir piquetes de <pasto>" (com 2 ou mais; o motivo ao lado);
 *  - `ConcluirPiquetesDialog`: o mês de início → a PRÉVIA do banco (`fn_piquetes_concluir` com p_simular) → Gravar (uma transação).
 * Os números da prévia são os do banco (a área de cada polígono pela fórmula do banco), nunca recalculados aqui. Recusa = a frase do
 * banco, dentro do diálogo (nunca toast).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Segmentado } from '@/components/ui/segmentado';
import { TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import type { Pasto } from '@/hooks/usePastos';
import { gravarPiquetes, previaDosPiquetes } from '@/hooks/usePiquetes';
import {
  dataBr, esperaPorPai, haBr, mesesDeInicio, motivoParaNaoConcluir,
  type PiqueteEmEspera, type PoligonoParaPiquete, type PreviaDosPiquetes,
} from '@/lib/mapa/piquetesEmEspera';
import { cn } from '@/lib/utils';

/** Os pastos que podem ser pai: ativos, sem fim de vigência e fora de grupo (o banco confere de novo). */
export function pastosQuePodemSerPai(pastos: readonly Pasto[]): Pasto[] {
  return pastos.filter((p) => p.ativo && !p.data_fim && !p.grupo_id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
}

export function MarcarPiquete({ poligono, pastos, espera, onMarcar, onTirar }: {
  poligono: PoligonoParaPiquete;
  pastos: readonly Pasto[];
  espera: readonly PiqueteEmEspera[];
  onMarcar: (p: PoligonoParaPiquete, paiId: string) => string | null;
  onTirar: (geometriaId: string) => void;
}) {
  const [recusa, setRecusa] = useState<string | null>(null);
  const naEspera = espera.find((x) => x.geometriaId === poligono.id);
  /* só o nome: a área oficial do pai NO MÊS aparece na prévia (PASTO-AREA-OFICIAL-02a: arquivo novo não lê a área de hoje do cadastro) */
  const opcoes = useMemo(() => pastosQuePodemSerPai(pastos).map((p) => ({ value: p.id, label: p.nome })), [pastos]);
  useEffect(() => { setRecusa(null); }, [poligono.id]);
  if (poligono.pasto_id) return null;   // já é pasto: o piquete não se aplica (o "Classificar" do Code 6 desliga)
  const nomeDoPai = naEspera ? pastos.find((p) => p.id === naEspera.paiId)?.nome ?? '' : '';
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-testid="marcar-piquete">
      <span className="text-[10px] font-semibold text-foreground">É piquete de</span>
      <div className="w-[150px]">
        <SearchableSelect value={naEspera?.paiId ?? ''} semTodos dense placeholder="escolha o pasto…" options={opcoes}
          onValueChange={(v) => { if (v) setRecusa(onMarcar(poligono, v)); }} />
      </div>
      {naEspera && (
        <>
          <span className="rounded-full bg-[#fff4e0] px-1.5 text-[9.5px] text-[#a15c00]" title={`Em espera como piquete de ${nomeDoPai}: nada foi gravado`}>
            em espera
          </span>
          <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => onTirar(poligono.id)}>Tirar</Button>
        </>
      )}
      {recusa && <p className="w-full text-[10px] font-medium text-destructive" role="alert">{recusa}</p>}
    </div>
  );
}

export function PiquetesEmEspera({ espera, pastos, onTirar, onConcluir }: {
  espera: readonly PiqueteEmEspera[];
  pastos: readonly Pasto[];
  onTirar: (geometriaId: string) => void;
  onConcluir: (paiId: string, piquetes: PiqueteEmEspera[]) => void;
}) {
  const grupos = useMemo(() => [...esperaPorPai(espera)], [espera]);
  if (grupos.length === 0) return null;
  return (
    <div className="grid gap-1 border-t border-border px-2 py-1.5 text-[10px]" data-testid="piquetes-em-espera">
      <span className="font-semibold text-foreground">Piquetes em espera (nada gravado ainda)</span>
      {grupos.map(([paiId, lista]) => {
        const nomeDoPai = pastos.find((p) => p.id === paiId)?.nome ?? 'pasto';
        const motivo = motivoParaNaoConcluir(lista);
        return (
          <div key={paiId} className="flex flex-wrap items-center gap-1" data-pai={paiId}>
            <span className="font-medium">{nomeDoPai}:</span>
            {lista.map((x) => (
              <span key={x.geometriaId} className="inline-flex items-center gap-0.5 rounded border border-border px-1">
                {x.nome}
                <button type="button" className="text-muted-foreground hover:text-destructive" aria-label={`Tirar ${x.nome} da espera`}
                  onClick={() => onTirar(x.geometriaId)}>×</button>
              </span>
            ))}
            <Button variant="outline" size="sm" className="ml-auto h-5 px-1.5 text-[10px]" disabled={!!motivo} title={motivo ?? undefined}
              onClick={() => onConcluir(paiId, lista)}>Concluir piquetes de {nomeDoPai}</Button>
            {motivo && <span className="w-full text-right text-[10px] text-muted-foreground">{motivo}</span>}
          </div>
        );
      })}
    </div>
  );
}

type Estado = { fase: 'lendo' } | { fase: 'previa'; previa: PreviaDosPiquetes } | { fase: 'recusa'; frase: string } | { fase: 'gravando'; previa: PreviaDosPiquetes };

export function ConcluirPiquetesDialog({ aberto, paiId, nomeDoPai, piquetes, hoje, onFechar, onGravado, contorno = null }: {
  aberto: boolean;
  paiId: string;
  nomeDoPai: string;
  piquetes: readonly PiqueteEmEspera[];
  /** MAPA-PIQUETES-04: o pai sem polígono → a união das divisões (ou a recusa dela); null = o pai já tem contorno */
  contorno?: { ok: true; valor: GeoJSON.Polygon } | { ok: false; motivo: string } | null;
  hoje?: Date;
  onFechar: () => void;
  onGravado: (paiId: string) => void;
}) {
  const meses = useMemo(() => mesesDeInicio(hoje ?? new Date()), [hoje]);
  const [mes, setMes] = useState(meses[meses.length - 1].valor);
  const [estado, setEstado] = useState<Estado>({ fase: 'lendo' });
  const ids = useMemo(() => piquetes.map((x) => x.geometriaId), [piquetes]);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    if (contorno && 'motivo' in contorno) { setEstado({ fase: 'recusa', frase: `${contorno.motivo} Nada foi gravado.` }); return; }
    setEstado({ fase: 'lendo' });
    void previaDosPiquetes({ paiId, geometriaIds: ids, mes, contorno: contorno?.ok ? contorno.valor : null }).then((r) => {
      if (!vivo) return;
      if ('motivo' in r) setEstado({ fase: 'recusa', frase: r.motivo }); else setEstado({ fase: 'previa', previa: r.valor });
    });
    return () => { vivo = false; };
  }, [aberto, paiId, ids, mes, contorno]);

  const gravar = async (previa: PreviaDosPiquetes) => {
    setEstado({ fase: 'gravando', previa });
    const r = await gravarPiquetes({ paiId, geometriaIds: ids, mes, contorno: contorno?.ok ? contorno.valor : null });
    if ('motivo' in r) { setEstado({ fase: 'recusa', frase: r.motivo }); return; }
    toast.success(`${nomeDoPai} virou o grupo ${previa.grupo.nome} com ${previa.piquetes.length} piquetes.`);
    onGravado(paiId);
    onFechar();
  };

  const previa = estado.fase === 'previa' || estado.fase === 'gravando' ? estado.previa : null;
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v && estado.fase !== 'gravando') onFechar(); }}>
      <DialogContent className="max-w-[520px]" data-testid="concluir-piquetes">
        <DialogHeader>
          <DialogTitle className="text-[13px]">Concluir piquetes de {nomeDoPai}</DialogTitle>
          <DialogDescription className="text-[10px]">
            Cada polígono vira um piquete (subárea) com a área dele; os piquetes formam o grupo {nomeDoPai}; {nomeDoPai} segue sendo o pasto e o card de cada mês.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">Os piquetes começam em</span>
          <Segmentado valor={mes} onEscolher={setMes} altura={22} opcoes={meses.map((m) => ({ valor: m.valor, rotulo: m.rotulo }))} />
        </div>
        <div className="min-h-[150px]" data-testid="previa-piquetes">
          {estado.fase === 'lendo' && <p className="text-[10px] text-muted-foreground">Lendo a prévia…</p>}
          {estado.fase === 'recusa' && <p className="text-[11px] font-medium text-destructive" role="alert">{estado.frase}</p>}
          {previa && (
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              {/* a coluna dos números pelo PIOR caso ("−99.999,99 (−100,0%)", 20 caracteres a 10px tabulares ≈ 128px): número nunca corta */}
              <colgroup><col /><col style={{ width: 128 }} /></colgroup>
              <thead className="bg-primary"><tr><th className={cn(TH_REGUA, 'text-left')}>Pasto novo (piquete)</th><th className={cn(TH_REGUA, 'text-right')}>Área (ha)</th></tr></thead>
              <tbody>
                {previa.piquetes.map((p) => (
                  <tr key={p.geometriaId} data-piquete={p.nome}>
                    <td className={TD_REGUA_TEXTO} title={p.nome}>{p.nome}</td>
                    <td className={TD_REGUA_NUM}>{haBr(p.areaHa)}</td>
                  </tr>
                ))}
                <tr className="font-semibold" data-linha="soma">
                  <td className={TD_REGUA_TEXTO}>Grupo {previa.grupo.nome} (Σ)</td>
                  <td className={TD_REGUA_NUM}>{haBr(previa.somaHa)}</td>
                </tr>
                <tr data-linha="oficial">
                  <td className={TD_REGUA_TEXTO}>Área oficial de {previa.pai.nome} no mês</td>
                  <td className={TD_REGUA_NUM}>{previa.pai.areaOficialHa == null ? '—' : haBr(previa.pai.areaOficialHa)}</td>
                </tr>
                <tr data-linha="diferenca">
                  <td className={TD_REGUA_TEXTO}>Diferença</td>
                  <td className={TD_REGUA_NUM}>
                    {previa.difHa == null ? '—' : `${previa.difHa > 0 ? '+' : ''}${haBr(previa.difHa)}${previa.difPct == null ? '' : ` (${previa.difPct > 0 ? '+' : ''}${previa.difPct.toLocaleString('pt-BR')}%)`}`}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          {previa && (
            <p className="mt-1.5 text-[10px] text-muted-foreground" data-testid="previa-pai">
              {previa.pai.nome} segue sendo o pasto e o card de cada mês; o histórico dele não muda.
              {/* MAPA-PIQUETES-04: o contorno nasce no mesmo gesto (a união das divisões) */}
              {previa.contorno?.criado && ` O contorno de ${previa.pai.nome}${previa.contorno.areaHa == null ? '' : ` (${haBr(previa.contorno.areaHa)} ha)`} é a união das divisões e é gravado junto.`}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar} disabled={estado.fase === 'gravando'}>Cancelar</Button>
          <Button size="sm" disabled={estado.fase !== 'previa'} onClick={() => { if (estado.fase === 'previa') void gravar(estado.previa); }}>
            {estado.fase === 'gravando' ? 'Gravando…' : 'Gravar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

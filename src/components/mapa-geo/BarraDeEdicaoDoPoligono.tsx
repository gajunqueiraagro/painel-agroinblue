/**
 * MAPA-EDITAR-POLIGONO-01 — a barra de edição do polígono, sobre o mapa da Validação (Gabriel 01/11/2026). Mostra o gesto em curso, as
 * medidas AO VIVO (área do mapa, perímetro, lados; a mesma conta do mapa), o aviso de sobreposição, as escolhas do gesto (metade que fica
 * com o original, para onde vai o pasto, vizinho a unir, motivo do apagar) e a PRÉVIA (a própria função do banco com simular) antes de
 * gravar. Cancelar não grava nada. No fim: "área do mapa X ha · cadastro Y ha" (a oficial é a do cadastro).
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Undo2, X } from 'lucide-react';
import { fraseDasAreas, textoHa, textoM } from '@/lib/mapa/edicaoDoPoligono';
import { areaEmHectares as areaDe } from '@/lib/mapa/areaDoPoligono';
import type { ModoDaEdicao, PoligonoDaFazenda, useEdicaoDoPoligono } from '@/hooks/useEdicaoDoPoligono';

const TITULO: Record<ModoDaEdicao, string> = {
  vertices: 'Editar vértices — arraste, clique no meio do lado para acrescentar, clique no ponto para tirar',
  redesenhar: 'Redesenhar — desenhe a divisa nova (clique ponto a ponto; clique no primeiro para fechar)',
  dividir: 'Dividir — risque a linha de um lado ao outro (duplo clique termina)',
  unir: 'Unir — escolha o vizinho que encosta',
  apagar: 'Apagar polígono',
  desenhar: 'Desenhar polígono novo (nasce sem vínculo e sem tipo)',
};

const NOME_DO_GESTO: Record<ModoDaEdicao, string> = {
  vertices: 'editar vértices', redesenhar: 'redesenhar', dividir: 'dividir', unir: 'unir', apagar: 'apagar', desenhar: 'desenhar polígono novo',
};

type Edicao = ReturnType<typeof useEdicaoDoPoligono>;

export function BarraDeEdicaoDoPoligono({ edicao, geometrias, nomeDoPasto, areaCadastroHa }: {
  edicao: Edicao;
  geometrias: readonly PoligonoDaFazenda[];
  nomeDoPasto: (id: string | null) => string | null;
  areaCadastroHa: number | null;
}) {
  const e = edicao;
  if (!e.modo) return null;
  const m = e.medidas;
  const lados = m && m.ladosM.length <= 12 ? m.ladosM.map(textoM).join(' · ') : null;
  const pastoDoAlvo = nomeDoPasto(e.alvo?.pasto_id ?? null);
  const podePrever = !!e.gesto && !e.gravando
    && !(e.modo === 'apagar' && (!e.motivo.trim() || (!!e.alvo?.pasto_id && !e.destinoDoPasto)))
    && !((e.modo === 'dividir' || e.modo === 'desenhar') && !e.nomeNovo.trim());
  const motivoDoBloqueio = e.modo === 'apagar' && !e.motivo.trim() ? 'Diga o motivo para apagar.'
    : e.modo === 'apagar' && e.alvo?.pasto_id && !e.destinoDoPasto ? 'Escolha o polígono que fica com o pasto (ou desligue o vínculo antes).'
    : !e.gesto ? 'Faça a mudança no mapa primeiro.' : null;

  return (
    <>
      <div className="absolute left-3 right-3 top-3 z-20 rounded-md border border-border bg-card/95 px-3 py-2 shadow-md backdrop-blur-sm"
        data-testid="barra-edicao-poligono">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[11px] font-semibold text-foreground">{TITULO[e.modo]}</p>
          {e.alvo && <span className="flex-none text-[10px] text-muted-foreground" title={e.alvo.nome}>{e.alvo.nome}{pastoDoAlvo ? ` → ${pastoDoAlvo}` : ''}</span>}
          <Button variant="ghost" size="sm" className="h-6 w-6 flex-none p-0" onClick={e.cancelar} title="Cancelar sem gravar" data-testid="edicao-cancelar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {m && e.modo !== 'apagar' && (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[10px] tabular-nums text-foreground" data-testid="edicao-medidas">
            <span className="font-semibold">{textoHa(m.areaHa)}</span>
            <span>perímetro {textoM(m.perimetroM)}</span>
            {lados && <span className="text-muted-foreground">lados {lados}</span>}
            <span className="text-muted-foreground" data-testid="edicao-areas">{fraseDasAreas(m.areaHa, areaCadastroHa)}</span>
          </div>
        )}

        {e.avisos.length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-700" data-testid="edicao-sobreposicao">
            <AlertTriangle className="h-3 w-3 flex-none" />
            Sobrepõe {e.avisos.map(s => `${s.nome} (${textoHa(s.areaHa)})`).join(', ')}
          </p>
        )}

        {e.modo === 'dividir' && e.divisao && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
            <span>Fica com o polígono original:</span>
            <Segmentado altura={22} fonte={10} valor={e.originalFicaCom} onEscolher={e.setOriginalFicaCom}
              opcoes={[{ valor: 'a', rotulo: `verde (${textoHa(areaDe(e.divisao.a))})` }, { valor: 'b', rotulo: `laranja (${textoHa(areaDe(e.divisao.b))})` }]} />
            {e.alvo?.pasto_id && (
              <Segmentado altura={22} fonte={10} valor={e.pastoVaiParaNova ? 'nova' : 'original'}
                onEscolher={(v) => e.setPastoVaiParaNova(v === 'nova')}
                opcoes={[{ valor: 'original', rotulo: `pasto ${pastoDoAlvo} fica no original` }, { valor: 'nova', rotulo: 'pasto vai para a parte nova' }]} />
            )}
          </div>
        )}

        {(e.modo === 'dividir' || e.modo === 'desenhar') && (
          <label className="mt-1.5 flex items-center gap-2 text-[10px]">
            <span className="flex-none">Nome do polígono novo</span>
            <Input value={e.nomeNovo} onChange={ev => e.setNomeNovo(ev.target.value)} className="h-6 max-w-[220px] text-[11px]" data-testid="edicao-nome-novo" />
          </label>
        )}

        {e.modo === 'unir' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
            <span className="flex-none">Unir com</span>
            <div className="w-[220px]">
              <SearchableSelect dense semTodos value={e.vizinhoId ?? ''} onValueChange={(v) => e.setVizinhoId(v || null)}
                placeholder={e.candidatosAUnir.length ? 'Escolha o vizinho' : 'Nenhum vizinho encosta'}
                options={e.candidatosAUnir.map(g => ({ value: g.id, label: g.nome_original, sub: nomeDoPasto(g.pasto_id) ?? 'sem vínculo' }))} />
            </div>
            {(() => {
              const v = geometrias.find(g => g.id === e.vizinhoId);
              if (!v?.pasto_id) return null;
              return (
                <Segmentado altura={22} fonte={10} valor={e.pastoDoVizinho ? 'vizinho' : 'alvo'} onEscolher={(x) => e.setPastoDoVizinho(x === 'vizinho')}
                  opcoes={[{ valor: 'alvo', rotulo: pastoDoAlvo ? `fica o pasto ${pastoDoAlvo}` : 'fica sem pasto' },
                    { valor: 'vizinho', rotulo: `fica o pasto ${nomeDoPasto(v.pasto_id)}` }]} />
              );
            })()}
          </div>
        )}

        {e.modo === 'apagar' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
            <label className="flex items-center gap-2">
              <span className="flex-none">Motivo</span>
              <Input value={e.motivo} onChange={ev => e.setMotivo(ev.target.value)} placeholder="ex.: divisa errada no KMZ" className="h-6 w-[240px] text-[11px]" data-testid="edicao-motivo" />
            </label>
            {e.alvo?.pasto_id && (
              <div className="flex items-center gap-2">
                <span className="flex-none">O pasto {pastoDoAlvo} fica com</span>
                <div className="w-[200px]">
                  <SearchableSelect dense semTodos value={e.destinoDoPasto ?? ''} onValueChange={(v) => e.setDestinoDoPasto(v || null)} placeholder="Escolha o polígono"
                    options={geometrias.filter(g => g.id !== e.alvo?.id && !g.pasto_id).map(g => ({ value: g.id, label: g.nome_original }))} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-2">
          <p className={`min-w-0 flex-1 text-[10px] font-medium ${e.erro ? 'text-red-600' : 'text-muted-foreground'}`} data-testid="edicao-erro">
            {e.erro ?? (podePrever ? '' : motivoDoBloqueio ?? '')}
          </p>
          <Button variant="outline" size="sm" className="h-6 px-3 text-[11px]" onClick={e.cancelar}>Cancelar</Button>
          <Button size="sm" className="h-6 px-3 text-[11px]" disabled={!podePrever} onClick={() => void e.prever()} data-testid="edicao-previa"
            title={podePrever ? undefined : motivoDoBloqueio ?? undefined}>
            {e.gravando ? 'Conferindo…' : 'Prévia e gravar'}
          </Button>
        </div>
      </div>

      <Dialog open={!!e.previa} onOpenChange={(o) => { if (!o) e.setPrevia(null); }}>
        <DialogContent className="max-w-md" data-testid="edicao-dialogo-previa">
          <DialogHeader>
            <DialogTitle className="text-sm">Prévia — {NOME_DO_GESTO[e.modo]}</DialogTitle>
            <DialogDescription className="text-[11px]">Nada foi gravado ainda. Confira e grave.</DialogDescription>
          </DialogHeader>
          {e.previa && (
            <div className="space-y-2 text-[11px]">
              <p className="tabular-nums" data-testid="previa-areas">
                Área do mapa: antes <b>{textoHa(e.previa.areaAntesHa)}</b> · depois <b>{textoHa(e.previa.areaDepoisHa)}</b>
              </p>
              <ul className="space-y-0.5">
                {e.previa.poligonos.map(p => (
                  <li key={`${p.id}-${p.mudanca}`}>
                    <b>{p.nome}</b> — {p.mudanca}
                    {p.pasto_antes !== p.pasto_depois && ` · pasto ${nomeDoPasto(p.pasto_antes) ?? '—'} → ${nomeDoPasto(p.pasto_depois) ?? '—'}`}
                  </li>
                ))}
              </ul>
              {e.previa.pastosSemPoligono.length > 0 && (
                <p className="font-medium text-amber-700" data-testid="previa-sem-poligono">
                  Fica sem polígono: {e.previa.pastosSemPoligono.map(p => p.nome).join(', ')}
                </p>
              )}
              {e.previa.sobreposicoes.length > 0 && (
                <p className="font-medium text-amber-700">Sobrepõe {e.previa.sobreposicoes.map(s => `${s.nome} (${textoHa(s.areaHa)})`).join(', ')}</p>
              )}
              <p className="text-muted-foreground">A área do cadastro não muda (adotar a área do mapa é outro gesto, na tela de pastos).</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => e.setPrevia(null)}>Voltar</Button>
            <Button size="sm" disabled={e.gravando} onClick={() => void e.gravar()} data-testid="previa-gravar">{e.gravando ? 'Gravando…' : 'Gravar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** O botão de desfazer o último gesto gravado (fica até o próximo gesto ou até desfazer). */
export function DesfazerUltimaEdicao({ edicao }: { edicao: Edicao }) {
  if (!edicao.ultimoGesto || edicao.modo) return null;
  const id = edicao.ultimoGesto;
  return (
    <Button variant="outline" size="sm" className="absolute bottom-3 left-3 z-20 h-6 gap-1 bg-card px-2 text-[11px]"
      disabled={edicao.gravando} onClick={() => void edicao.desfazer(id)} data-testid="edicao-desfazer">
      <Undo2 className="h-3 w-3" />Desfazer a última edição
    </Button>
  );
}

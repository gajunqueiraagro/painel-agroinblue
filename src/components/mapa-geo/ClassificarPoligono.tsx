/**
 * MAPA-AREA-TIPO-01 — o gesto "É pasto / É área + tipo / Sem classificação" no painel do polígono da Validação (Gabriel 01/11).
 * Um botão próprio no painel (os outros gestos — "Transformar em piquetes" do Code 4 e "Editar polígono" do Code 3 — ficam ao lado,
 * cada um no seu). Grava SÓ pelo escritor do banco (prévia antes, trilha, memória para o "Atualizar mapa"); a recusa do banco aparece
 * aqui mesmo, nunca em toast. O botão desabilitado diz por quê.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import { useClassificarPoligono, useNomeDoGrupo, type PreviaDaClassificacao } from '@/hooks/useClassificarPoligono';
import {
  definicaoDoTipoDeArea, ehTipoDeArea, fraseJaEstaAssim, opcoesDeTipoDeArea, ROTULO_DA_ATIVIDADE_DA_AREA, ROTULO_DA_FAMILIA_DE_AREA, TIPOS_DE_AREA,
  type DestinoDoPoligono, type TipoDeArea,
} from '@/lib/mapa/tiposDeArea';

type Escolha = 'pasto' | 'area' | 'outra';

interface Props {
  geo: Pick<FazendaGeometria, 'id' | 'tipo' | 'pasto_id'>;
  pastos: readonly (Pick<Pasto, 'id' | 'nome' | 'ativo'> & Partial<Pick<Pasto, 'data_inicio' | 'grupo_id'>>)[];
  geometrias: readonly Pick<FazendaGeometria, 'id' | 'pasto_id' | 'nome_original'>[];
  /** o tipo pedido pelo Adicionar › Área (já chega escolhido) */
  tipoInicial?: TipoDeArea | null;
  onGravou: () => void;
  onFechar: () => void;
}

export function ClassificarPoligono({ geo, pastos, geometrias, tipoInicial, onGravou, onFechar }: Props) {
  const [escolha, setEscolha] = useState<Escolha>(tipoInicial ? 'area' : geo.tipo === 'pasto' ? 'pasto' : ehTipoDeArea(geo.tipo) ? 'area' : 'outra');
  const [pastoId, setPastoId] = useState(geo.pasto_id ?? '');
  const [tipoArea, setTipoArea] = useState<string>(tipoInicial ?? (ehTipoDeArea(geo.tipo) ? geo.tipo : ''));
  const [previa, setPrevia] = useState<PreviaDaClassificacao | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const { prever, gravar, gravando } = useClassificarPoligono();

  const destino: DestinoDoPoligono | null = useMemo(() => {
    if (escolha === 'outra') return { tipo: 'outra' };
    if (escolha === 'pasto') return pastoId ? { tipo: 'pasto', pastoId } : null;
    const t = TIPOS_DE_AREA.find(x => x.tipo === tipoArea)?.tipo;
    return t ? { tipo: t } : null;
  }, [escolha, pastoId, tipoArea]);

  /* a prévia do banco a cada escolha completa (o que muda, ou a recusa pronta); a leitura que chega atrasada não escreve */
  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setRecusa(null);
    if (!destino) return;
    prever(geo.id, destino).then(r => {
      if (!vivo) return;
      if (r.ok) setPrevia(r.valor); else setRecusa(r.motivo);
    });
    return () => { vivo = false; };
  }, [geo.id, destino, prever]);

  const ligadoA = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of geometrias) if (g.pasto_id && g.id !== geo.id) m.set(g.pasto_id, g.nome_original);
    return m;
  }, [geometrias, geo.id]);
  const opcoesDePasto = useMemo(() => pastos.filter(p => p.ativo).map(p => ({
    value: p.id, label: p.nome, sub: ligadoA.has(p.id) ? `já ligado a "${ligadoA.get(p.id)}"` : undefined, subAlerta: ligadoA.has(p.id),
  })), [pastos, ligadoA]);
  /* MAPA-AREA-TIPOS-02: agrupado por família (o grupo do seletor da casa), com a atividade à direita */
  const opcoesDeArea = useMemo(() => opcoesDeTipoDeArea(), []);
  /* a prévia SEM mudança diz o estado atual (o pasto, o grupo e o mês de início; o tipo de área; sem classificação) */
  const pastoEscolhido = escolha === 'pasto' ? pastos.find(p => p.id === pastoId) ?? null : null;
  const nomeDoGrupo = useNomeDoGrupo(pastoEscolhido?.grupo_id);
  const fraseSemMudanca = !destino ? '' : destino.tipo === 'outra' ? fraseJaEstaAssim({ tipo: 'outra' })
    : destino.tipo === 'pasto' ? fraseJaEstaAssim({ tipo: 'pasto', pasto: pastoEscolhido?.nome ?? '', grupo: nomeDoGrupo, desde: pastoEscolhido?.data_inicio })
      : fraseJaEstaAssim({ tipo: 'area', rotulo: definicaoDoTipoDeArea(destino.tipo)?.rotulo ?? destino.tipo });
  const defArea = escolha === 'area' ? definicaoDoTipoDeArea(tipoArea) : null;

  const porQue = !destino ? (escolha === 'pasto' ? 'Escolha o pasto.' : 'Escolha o tipo de área.')
    : recusa ? null : !previa ? 'Conferindo…' : previa.semMudanca ? 'Nada para gravar.' : null;

  const aoGravar = async () => {
    if (!destino) return;
    const r = await gravar(geo.id, destino);
    if (r.ok) onGravou(); else setRecusa(r.motivo);
  };

  return (
    <div className="mt-2 border-t border-border pt-2" data-testid="classificar-poligono">
      <Segmentado valor={escolha} onEscolher={setEscolha} altura={22} fonte={10}
        opcoes={[{ valor: 'pasto', rotulo: 'É pasto' }, { valor: 'area', rotulo: 'É área' }, { valor: 'outra', rotulo: 'Sem classificação' }]} />
      {/* o lugar do seletor existe sempre (trocar a escolha não move os botões) */}
      <div className="mt-1.5 h-[26px]" data-testid="classificar-poligono-seletor">
        {escolha === 'pasto' && (
          <SearchableSelect value={pastoId} onValueChange={setPastoId} options={opcoesDePasto} placeholder="Escolha o pasto" allValue="" allLabel="Escolha o pasto" semTodos dense triggerClassName="h-[26px] min-h-0 py-0 text-[10.5px]" />
        )}
        {escolha === 'area' && (
          <SearchableSelect value={tipoArea} onValueChange={setTipoArea} options={opcoesDeArea} placeholder="Escolha o tipo de área" allValue="" allLabel="Escolha o tipo de área" semTodos dense triggerClassName="h-[26px] min-h-0 py-0 text-[10.5px]" />
        )}
      </div>
      {/* MAPA-AREA-TIPOS-02: família · atividade · não conta como área produtiva (lugar reservado: escolher não move nada) */}
      <div className="mt-1 h-[24px] overflow-hidden text-[9.5px] leading-[12px] text-[#5A6472]" data-testid="classificar-poligono-familia">
        {defArea ? `${ROTULO_DA_FAMILIA_DE_AREA[defArea.familia]} · ${defArea.atividade ? ROTULO_DA_ATIVIDADE_DA_AREA[defArea.atividade] : 'sem atividade'} · não conta como área produtiva` : ''}
      </div>
      {/* 3 linhas reservadas: a frase do estado atual com o grupo é a mais longa */}
      <div className="mt-1 h-[39px] overflow-hidden text-[10px] leading-[13px]" data-testid="classificar-poligono-previa">
        {recusa ? <span className="text-[#B03A2E]">{recusa}</span>
          : previa?.semMudanca ? <span className="text-[#1d232b]">{fraseSemMudanca}</span>
          : previa && !previa.semMudanca ? <span className="text-[#1d232b]">{previa.de} → <b className="font-semibold">{previa.para}</b></span>
          : null}
      </div>
      <div className="mt-1 flex items-center justify-end gap-1.5">
        {porQue && <span className="mr-auto text-[10px] text-[#5A6472]">{porQue}</span>}
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10.5px]" onClick={onFechar}>Cancelar</Button>
        <Button type="button" size="sm" className="h-6 px-2 text-[10.5px]" onClick={aoGravar}
          disabled={!!porQue || !!recusa || gravando} title={porQue ?? recusa ?? undefined}>
          {gravando ? 'Gravando…' : 'Gravar'}
        </Button>
      </div>
    </div>
  );
}

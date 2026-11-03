/**
 * MAPA-AREA-TIPOS-02 (D3, Gabriel 02/11) — a ESTRUTURA COM VALOR de uma área do mapa (armazém, silo, oficina, sede, casa, escritório,
 * curral, confinamento, represa) no painel do polígono da Validação.
 * - Ainda não é infraestrutura: "Criar a estrutura" → a prévia do banco (`fn_mapa_estrutura_da_area` com simular: o tipo e a área) →
 *   "Confirmar" grava a infraestrutura com a geometria do polígono e o elo `geometria_id`.
 * - Já é: o nome do tipo e "Ficha e Patrimônio no Gestor" — a ficha, o "Criar bem no Patrimônio" e o "Ligar a um bem existente" são os do
 *   painel da infraestrutura (INFRA-FICHAS-PATR-01): um caminho só para o bem.
 * A recusa do banco aparece aqui (nunca toast).
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatNum } from '@/lib/calculos/formatters';
import { definicaoDoTipoDeArea } from '@/lib/mapa/tiposDeArea';
import { definicaoDoTipo, type InfraLida } from '@/lib/mapa/infraestrutura';
import type { Resposta } from '@/hooks/useInfraestruturas';

function linhaDaPrevia(d: unknown): string {
  if (typeof d !== 'object' || d === null) return '';
  const rotulo = Reflect.get(d, 'rotulo'); const area = Reflect.get(d, 'area_ha'); const partes = Reflect.get(d, 'partes');
  return [typeof rotulo === 'string' ? `Vira a infraestrutura "${rotulo}"` : '',
    typeof area === 'number' ? `${formatNum(area, 2)} ha` : '',
    typeof partes === 'number' && partes > 1 ? `das ${partes} partes do polígono, a maior` : ''].filter(Boolean).join(' · ');
}

export function EstruturaDaArea({ geometriaId, tipoDaArea, infras, estruturaDaArea, onCriou, onAbrirNoGestor }: {
  geometriaId: string;
  tipoDaArea: string;
  infras: readonly InfraLida[];
  estruturaDaArea: (geometriaId: string, simular: boolean) => Promise<Resposta>;
  onCriou: () => void;
  /** abre o Gestor com o painel desta infraestrutura (ficha + Patrimônio); ausente = o botão não aparece */
  onAbrirNoGestor?: (infraId: string) => void;
}) {
  const def = definicaoDoTipoDeArea(tipoDaArea);
  const existente = infras.find(i => i.geometria_id === geometriaId) ?? null;
  const [previa, setPrevia] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  useEffect(() => { setPrevia(null); setRecusa(null); }, [geometriaId, tipoDaArea]);
  if (!def?.infra) return null;

  const verPrevia = async () => {
    setRecusa(null);
    const r = await estruturaDaArea(geometriaId, true);
    if (!r.ok) { setRecusa(r.motivo); return; }
    setPrevia(linhaDaPrevia(r.dado));
  };
  const confirmar = async () => {
    setGravando(true);
    const r = await estruturaDaArea(geometriaId, false);
    setGravando(false);
    if (!r.ok) { setRecusa(r.motivo); return; }
    setPrevia(null);
    onCriou();
  };

  return (
    <div className="mt-2 border-t border-border pt-2 text-[10px] leading-[13px]" data-testid="estrutura-da-area">
      <div className="mb-1 text-[9.5px] font-semibold text-[#4A5361]">Patrimônio</div>
      {existente ? (
        <div className="flex flex-col gap-1">
          <span>É a infraestrutura <b className="font-semibold">{definicaoDoTipo(existente.tipo)?.rotulo ?? existente.tipo}</b>{existente.bem_id ? ' · com bem ligado' : ' · ainda sem bem'}.</span>
          {onAbrirNoGestor && (
            <Button type="button" variant="outline" size="sm" className="h-6 self-start px-2 text-[10.5px]" onClick={() => onAbrirNoGestor(existente.id)}>
              Ficha e Patrimônio no Gestor
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-[#5A6472]">Estrutura com valor: vira infraestrutura (com ficha) e o bem nasce pelo mesmo caminho das fichas.</span>
          {/* lugar reservado da prévia/recusa: nada abaixo se desloca */}
          <div className="min-h-[26px]" data-testid="estrutura-da-area-previa">
            {recusa ? <span className="text-[#B03A2E]">{recusa}</span> : previa ? <span>{previa}</span> : null}
          </div>
          {!previa
            ? <Button type="button" variant="outline" size="sm" className="h-6 self-start px-2 text-[10.5px]" onClick={verPrevia}>Criar a estrutura</Button>
            : <Button type="button" size="sm" className="h-6 self-start px-2 text-[10.5px]" onClick={confirmar} disabled={gravando || !!recusa}>
              {gravando ? 'Gravando…' : 'Confirmar'}</Button>}
        </div>
      )}
    </div>
  );
}

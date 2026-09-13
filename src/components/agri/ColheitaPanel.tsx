/**
 * A COLHEITA DO TALHÃO, DENTRO DO CADASTRO DE ÁREA — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ IRMÃO DO PAINEL DE ÁREA, E ABAIXO DELE: é o fluxo do operador — cadastra o que plantou e,
 * no mesmo lugar, registra o que colheu. Uma tela separada obrigaria a reencontrar o pasto.
 * ⚠ O LANÇAMENTO DE VERDADE MORA EM PRODUÇÃO › LANÇAR › AGRICULTURA. Aqui é o atalho de quem
 * já está com o talhão aberto na mão; lá é a tela da safra, com o consolidado da cooperativa.
 * As duas montam o MESMO `CargasDaArea` — a lista não existe duas vezes.
 * ⚠ UMA LISTA POR CULTURA. O pasto com amendoim e milho tem duas áreas e duas colheitas: o
 * seco de uma não se soma ao da outra, e é por isso que o bloco se repete por área.
 */
import { useMemo } from 'react';
import { useColheita } from '@/hooks/useColheita';
import { CargasDaArea } from '@/components/agri/CargasDaArea';
import type { AreaPlantadaRow } from '@/hooks/useAreaPlantada';

interface Props {
  clienteId: string | null | undefined;
  /** As áreas JÁ GRAVADAS da safra/pasto — nunca as linhas em edição do painel de cima. */
  areas: readonly AreaPlantadaRow[];
  somenteLeitura: boolean;
}

export function ColheitaPanel({ clienteId, areas, somenteLeitura }: Props) {
  const ids = useMemo(() => areas.map(a => a.id), [areas]);
  const { linhas, salvarCarga, excluirCarga } = useColheita(ids);

  if (areas.length === 0) return null;

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">
        Colheita
      </div>
      {areas.map(area => (
        /* ⚠ ALTURA LIMITADA AQUI, e só aqui: no cadastro o bloco convive com o painel de área
           acima dele, e uma lista sem teto empurraria o formulário de plantio para fora da
           vista. Na tela de Produção o mesmo componente ocupa o que sobra da página. */
        <div key={area.id} className="flex max-h-[320px] min-h-0 flex-col">
          <CargasDaArea
            clienteId={clienteId}
            safraAreaId={area.id}
            cultura={area.cultura}
            areaHa={area.area_plantada_ha}
            linhas={linhas.filter(l => l.safra_area_id === area.id)}
            salvarCarga={salvarCarga}
            excluirCarga={excluirCarga}
            somenteLeitura={somenteLeitura}
          />
        </div>
      ))}
    </div>
  );
}

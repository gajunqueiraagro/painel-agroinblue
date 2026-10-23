/**
 * ESCOLHER A CONTA — SELETOR-CONTA-POR-ATIVIDADE-01 (P78, Gabriel 23/10/2026). O componente UNICO de escolher a conta do plano pelo id
 * (`plano_conta_id`) onde a conta e' escolhida fora do cluster da aba Geral: a conta de cada item da nota (aba Contas), as partes do
 * "Dividir…" e o subcentro da previa da nota. Em cima a barra de atividade (as que o plano do cliente usa neste tipo), embaixo a busca ja'
 * filtrada por ela; a atividade nasce da conta de hoje, senao de `atividadeSugerida`. E' o `PlanoSubcentroSelect` de sempre (a mesma
 * lista, o mesmo teclado, o mesmo "mostrar todos") com `atividadeNaLista` — a aba Geral ja' tem a barra DELA ao lado do campo.
 */
import { useState } from 'react';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { Atividade } from '@/lib/financeiro/ultimaAtividade';

export function EscolherConta({ valor, classificacoes, tipoOperacao, onEscolher, atividadeSugerida = null, label, triggerClassName, itemClassName, disabled, tabIndex }: {
  /** o `plano_conta_id` escolhido ('' = nenhum) */
  valor: string;
  classificacoes: ClassificacaoItem[];
  tipoOperacao: string;
  onEscolher: (conta: ClassificacaoItem & { id: string }) => void;
  /** a atividade que a barra marca quando ainda nao ha' conta (a do lancamento, a da sugestao) */
  atividadeSugerida?: Atividade | null;
  label?: string;
  triggerClassName?: string;
  itemClassName?: string;
  disabled?: boolean;
  tabIndex?: number;
}) {
  const [busca, setBusca] = useState('');
  const sub = classificacoes.find((c) => c.id === valor)?.subcentro ?? '';
  return (
    <PlanoSubcentroSelect value={sub} onChange={() => undefined}
      onSelected={(_s, cls) => { const id = cls?.id; if (cls && id) onEscolher({ ...cls, id }); }}
      classificacoes={classificacoes} tipoOperacao={tipoOperacao} search={busca} onSearchChange={setBusca} label={label}
      triggerClassName={triggerClassName} itemClassName={itemClassName} disabled={disabled} tabIndex={tabIndex}
      atividadeNaLista atividadeInicial={atividadeSugerida} />
  );
}

// ResultadoSubcentroEditor — PR-U2c-2B. Célula "Resultado" editável do Subcentro,
// reutilizando o componente OFICIAL PlanoSubcentroSelect (fonte única). Estado local
// só de busca; a gravação vai por onEditar({ subcentro }) → fn_classificacao_editar_proposto.
// Só oferece subcentros do plano (classificacoes) → nunca cria órfão.
import { useState } from 'react';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';

export interface ResultadoSubcentroEditorProps {
  value: string | null;
  tipoOperacao: string | null;
  classificacoes: ClassificacaoItem[];
  disabled?: boolean;
  onEditar: (patch: Record<string, unknown>) => Promise<void>;
}

export function ResultadoSubcentroEditor({
  value, tipoOperacao, classificacoes, disabled, onEditar,
}: ResultadoSubcentroEditorProps) {
  const [search, setSearch] = useState('');
  return (
    <PlanoSubcentroSelect
      value={value ?? ''}
      onChange={(sub) => { void onEditar({ subcentro: sub }); }}
      classificacoes={classificacoes}
      tipoOperacao={tipoOperacao ?? ''}
      search={search}
      onSearchChange={setSearch}
      disabled={disabled}
      triggerClassName="h-6 text-[10px] px-2"
      contentClassName="w-[22rem]"
      itemClassName="text-[11px] py-1"
    />
  );
}

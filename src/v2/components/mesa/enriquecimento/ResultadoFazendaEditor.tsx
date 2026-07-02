// ResultadoFazendaEditor — P0-4. Célula "Resultado" editável da Fazenda, reutilizando
// o FazendaSelect OFICIAL (fonte única) — mantém a regra Dividendos→Administrativo
// (Select desabilitado + aviso âmbar).
//
// REGRA DA MESA: abrir/montar uma linha NUNCA pode gravar. O FazendaSelect tem um
// useEffect que dispara onChange para forçar Administrativo — na Mesa isso viraria
// uma gravação automática no mount. Bloqueamos: só gravamos (editarProposto) em
// interação EXPLÍCITA do usuário. Como o Select fica `disabled` quando forçado, o
// único onChange possível com `forcaAdministrativo=true` é o automático → ignorado;
// com `forcaAdministrativo=false` o Select está habilitado e todo onChange vem de
// uma seleção real do operador → grava.
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import type { Fazenda } from '@/contexts/FazendaContext';

export interface ResultadoFazendaEditorProps {
  value: string | null;
  fazendas: Fazenda[];
  forcaAdministrativo: boolean;   // = edicao.macro === 'Dividendos'
  disabled?: boolean;
  onEditar: (patch: Record<string, unknown>) => Promise<void>;
}

export function ResultadoFazendaEditor({
  value, fazendas, forcaAdministrativo, disabled, onEditar,
}: ResultadoFazendaEditorProps) {
  return (
    <FazendaSelect
      value={value ?? ''}
      onChange={(id) => { if (!forcaAdministrativo) void onEditar({ fazenda_id: id }); }}
      fazendas={fazendas}
      forcaAdministrativo={forcaAdministrativo}
      disabled={disabled}
    />
  );
}

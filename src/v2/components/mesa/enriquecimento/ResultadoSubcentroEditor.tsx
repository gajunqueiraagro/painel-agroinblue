// ResultadoSubcentroEditor — PR-U2c-2B. Célula "Resultado" editável do Subcentro,
// reutilizando o componente OFICIAL PlanoSubcentroSelect (fonte única). Estado local
// só de busca; a gravação vai por onEditar({ subcentro }) → fn_classificacao_editar_proposto.
// Só oferece subcentros do plano (classificacoes) → nunca cria órfão.
import { useState } from 'react';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { CELULA_EDITAVEL, ITEM_DROPDOWN } from './medidasMesa';
import { ehTipoTransferencia, TIPO_TRANSFERENCIA } from '@/v2/lib/mesa/transferenciaPlano';

export interface ResultadoSubcentroEditorProps {
  value: string | null;
  tipoOperacao: string | null;
  classificacoes: ClassificacaoItem[];
  disabled?: boolean;
  /**
   * O subcentro da linha 18010 — PR-MESA-TRANSF-01. `null` quando o catálogo não chegou.
   *
   * ⚠ A REGRA DA TRANSFERÊNCIA VALE NOS DOIS SENTIDOS. O item 3 diz que escolher o tipo
   * "Transferência" fixa esta conta do plano; sem o caminho inverso, escolher a conta 18010
   * aqui deixava a linha num estado que não existe — classificada como transferência, com
   * `tipo_operacao` de saída e sem destino. E é justamente por aqui que o APELIDO ENSINADO
   * entra: o motor propõe o subcentro pelo apelido, o operador confirma a proposta, e o
   * tipo e o destino vêm junto no mesmo patch em vez de virarem dois gestos.
   */
  subcentroTransferencia?: string | null;
  /** A conta que o texto de destino da planilha resolve (apelido do cadastro de contas). */
  contaDestinoSugeridaId?: string | null;
  onEditar: (patch: Record<string, unknown>) => Promise<void>;
}

export function ResultadoSubcentroEditor({
  value, tipoOperacao, classificacoes, disabled,
  subcentroTransferencia, contaDestinoSugeridaId, onEditar,
}: ResultadoSubcentroEditorProps) {
  const [search, setSearch] = useState('');
  return (
    <PlanoSubcentroSelect
      value={value ?? ''}
      onChange={(sub) => {
        const patch: Record<string, unknown> = { subcentro: sub };
        if (subcentroTransferencia && sub === subcentroTransferencia
            && !ehTipoTransferencia(tipoOperacao)) {
          patch.tipo_operacao = TIPO_TRANSFERENCIA;
          if (contaDestinoSugeridaId) patch.conta_destino_id = contaDestinoSugeridaId;
        }
        void onEditar(patch);
      }}
      classificacoes={classificacoes}
      tipoOperacao={tipoOperacao ?? ''}
      search={search}
      onSearchChange={setSearch}
      disabled={disabled}
      triggerClassName={CELULA_EDITAVEL}
      size="compact"
      contentClassName="w-[22rem]"
      itemClassName={ITEM_DROPDOWN}
    />
  );
}

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { criarFornecedorDaCasa } from '@/lib/fornecedores/cadastroDaCasaBanco';

/**
 * O CAMPO DE FORNECEDOR DOS MODAIS DA LAVOURA — FORN-SELETOR-PADRAO-01 fatia 2d.
 *
 * NÃO É UM SELETOR: é o encaixe do DONO (`FavorecidoSelect`, pelo leitor único) na anatomia que os quatro modais da Lavoura
 * já tinham medida em volta do seletor antigo — combobox de 32px + "+" de 32px a 6px dele, sem rótulo próprio (o rótulo é do
 * hospedeiro), sem a linha do documento (o documento vai no `title` do campo) — e o "+" abrindo o CADASTRO DA CASA.
 *
 * ⚠ UM GESTO, UMA CHAMADA: `onChange(id, nome)` — o nome é o do cadastro, entregue pelo dono no `onSelected` (o fornecedor
 *   inteiro); esvaziar entrega `(null, null)`. Nenhuma segunda leitura nasce para saber o nome do escolhido.
 * ⚠ O "✕ Remover seleção" do seletor antigo virou o item "— nenhum —" da lista: o campo não muda mais de largura ao escolher.
 * ⚠ TRAVADO (`disabled`): sem o "+", largura inteira, texto legível (o dono apagaria a 50%) — é o "só leitura" de antes.
 */
export function FornecedorDaLavoura({ clienteId, value, onChange, placeholder, disabled = false }: {
  clienteId: string | null | undefined;
  value: string | null | undefined;
  onChange: (id: string | null, nome: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [novoAberto, setNovoAberto] = useState(false);
  return (
    <>
      <FavorecidoSelect
        clienteId={clienteId}
        value={value ?? ''}
        /* escolher chega pelo `onSelected` (com o nome do cadastro); aqui só o esvaziar */
        onChange={(id) => { if (!id) onChange(null, null); }}
        onSelected={(f) => onChange(f.id, f.nome)}
        limpavel
        linhaDoDocumento={false}
        placeholder={placeholder}
        disabled={disabled}
        triggerClassName={cn(
          !value && 'text-muted-foreground',
          /* o dono separa o "+" a 4px; estes modais foram medidos com 6 */
          !disabled && 'mr-0.5',
          disabled && 'bg-muted/30 disabled:opacity-100',
        )}
        onCriarNovo={disabled ? undefined : () => setNovoAberto(true)}
        novoRotulo="Cadastrar novo fornecedor"
      />
      <NovoFornecedorDialog
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        clienteId={clienteId}
        onSelecionar={(f) => onChange(f.id, f.nome)}
        onSave={async (nome, cpfCnpj) => {
          if (!clienteId) return;
          const novo = await criarFornecedorDaCasa(clienteId, { nome, cpfCnpj });
          onChange(novo.id, novo.nome);
          setNovoAberto(false);
        }}
      />
    </>
  );
}

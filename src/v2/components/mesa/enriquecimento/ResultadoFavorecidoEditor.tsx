// ResultadoFavorecidoEditor — PR-U2c-2C. Célula "Resultado" editável do Fornecedor,
// reutilizando o FavorecidoSelect OFICIAL (fonte única) + NovoFornecedorDialog para
// criação inline. Estado local só de busca e do diálogo; a gravação vai por
// onEditar({ favorecido_id }). `onSelected` (forma/dados de pagamento) é omitido —
// não se aplica à Mesa. PR-FORNECEDOR-FAZENDA-01: a criação usa a fazenda proposta da
// linha QUANDO EXISTIR; sem fazenda, o fornecedor nasce do cliente (fazenda é opcional).
import { useState } from 'react';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import type { FornecedorV2 } from '@/hooks/useFinanceiroV2';

export interface ResultadoFavorecidoEditorProps {
  value: string | null;
  fornecedores: FornecedorV2[];
  fazendaId: string | null;   // fazenda proposta da linha (para cadastrar fornecedor)
  disabled?: boolean;
  onEditar: (patch: Record<string, unknown>) => Promise<void>;
  onCriarFornecedor: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
}

export function ResultadoFavorecidoEditor({
  value, fornecedores, fazendaId, disabled, onEditar, onCriarFornecedor,
}: ResultadoFavorecidoEditorProps) {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultNome, setDefaultNome] = useState('');

  return (
    <>
      <FavorecidoSelect
        value={value ?? ''}
        onChange={(id) => { void onEditar({ favorecido_id: id }); }}
        fornecedores={fornecedores}
        search={search}
        onSearchChange={setSearch}
        onCriarNovo={() => { setDefaultNome(search); setDialogOpen(true); }}
        disabled={disabled}
        triggerClassName="h-6 text-[10px] px-2"
      />
      <NovoFornecedorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        defaultNome={defaultNome}
        onSave={async (nome, cpfCnpj) => {
          // PR-FORNECEDOR-FAZENDA-01: sem guard de fazenda — fazenda é opcional.
          const f = await onCriarFornecedor(nome, fazendaId ?? null, cpfCnpj);
          if (f) { void onEditar({ favorecido_id: f.id }); setDialogOpen(false); }
        }}
      />
    </>
  );
}

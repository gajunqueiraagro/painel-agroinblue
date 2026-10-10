import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { criarFornecedorDaCasa } from '@/lib/fornecedores/cadastroDaCasaBanco';

/**
 * O CAMPO DE FORNECEDOR COM O CADASTRO DA CASA — o encaixe ÚNICO do dono nos modais que tinham o seletor antigo.
 * FORN-SELETOR-PADRAO-01 fatia 2d (Lavoura; nasceu como `FornecedorDaLavoura`) e fatia 2e (Pecuária legado e meta).
 *
 * NÃO É UM SELETOR: é o DONO (`FavorecidoSelect`, pelo leitor único) na anatomia que esses modais já tinham medida em volta do
 * seletor antigo — combobox de 32px + "+" de 32px a 6px dele, sem rótulo próprio (o rótulo é do hospedeiro), sem a linha do
 * documento (o documento vai no `title` do campo) — e o "+" abrindo o CADASTRO DA CASA. PROIBIDO nascer um segundo encaixe.
 *
 * ⚠ UM GESTO, UMA CHAMADA: `onChange(id, nome)` — o nome é o do cadastro, entregue pelo dono no `onSelected` (o fornecedor
 *   inteiro); esvaziar entrega `(null, null)`. Nenhuma segunda leitura nasce para saber o nome do escolhido.
 * ⚠ O "✕ Remover seleção" do seletor antigo virou o item "— nenhum —" da lista: o campo não muda mais de largura ao escolher.
 * ⚠ TRAVADO (`disabled`): sem o "+", largura inteira, texto legível (o dono apagaria a 50%) — é o "só leitura" de antes.
 * ⚠ `incluirMeta` — só os modais de META: o cadastro "[META] Planejamento" continua oferecido.
 * ⚠ `textoLegado` — o lançamento antigo que só tem o TEXTO do fornecedor, sem id: enquanto não há id, o campo MOSTRA esse texto
 *   (âmbar, com "histórico, não vinculado"; inteiro no `title`), na mesma altura de sempre. O campo NUNCA escreve nem apaga o
 *   texto: ele não chama `onChange` ao abrir, e o texto é do hospedeiro. Com o "+", o cadastro abre com o texto no nome.
 *   O sentinela '[nao informado]' nunca aparece.
 */
const SENTINELA_NAO_INFORMADO = '[nao informado]';

/** O texto histórico que vale mostrar: nunca vazio, nunca o sentinela. */
export function textoLegadoVisivel(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim();
  return t && t !== SENTINELA_NAO_INFORMADO ? t : null;
}

export function CampoDeFornecedor({ clienteId, value, onChange, placeholder, disabled = false, incluirMeta = false, textoLegado }: {
  clienteId: string | null | undefined;
  value: string | null | undefined;
  onChange: (id: string | null, nome: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  incluirMeta?: boolean;
  textoLegado?: string | null;
}) {
  const [novoAberto, setNovoAberto] = useState(false);
  /* só existe enquanto NÃO há id: escolhido um fornecedor, quem aparece é ele */
  const legado = value ? null : textoLegadoVisivel(textoLegado);
  const campo = (
      <FavorecidoSelect
        clienteId={clienteId}
        value={value ?? ''}
        /* escolher chega pelo `onSelected` (com o nome do cadastro); aqui só o esvaziar */
        onChange={(id) => { if (!id) onChange(null, null); }}
        onSelected={(f) => onChange(f.id, f.nome)}
        limpavel
        linhaDoDocumento={false}
        incluirMeta={incluirMeta}
        placeholder={legado ? `${legado} · histórico, não vinculado` : placeholder}
        disabled={disabled}
        triggerClassName={cn(
          !value && !legado && 'text-muted-foreground',
          legado && 'border-amber-300 text-amber-800',
          /* o dono separa o "+" a 4px; estes modais foram medidos com 6 */
          !disabled && 'mr-0.5',
          disabled && 'bg-muted/30 disabled:opacity-100',
        )}
        onCriarNovo={disabled ? undefined : () => setNovoAberto(true)}
        novoRotulo="Cadastrar novo fornecedor"
      />
  );
  return (
    <>
      {legado
        ? <div data-testid="fornecedor-texto-legado" title={`Texto histórico: "${legado}" — fornecedor não vinculado ao cadastro. Escolha na lista para vincular.`}>{campo}</div>
        : campo}
      <NovoFornecedorDialog
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        clienteId={clienteId}
        defaultNome={legado ?? undefined}
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

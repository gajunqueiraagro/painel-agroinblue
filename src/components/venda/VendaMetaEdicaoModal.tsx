/**
 * VendaMetaEdicaoModal — a EDIÇÃO de uma venda em META, no mesmo modal que a registra.
 *
 * PR-ZOO-VENDA-META-EDICAO-01, no padrão do CompraMetaEdicaoModal.
 *
 * ⚠ O PREÇO VOLTA POR LEITURA DIRETA, e é a diferença central contra a compra. Lá o banco
 * guarda só o total, e o campo pede R$/kg — por isso o preço é derivado. Aqui o banco
 * guarda os TRÊS: `preco_arroba` (o unitário), `tipo_peso` (a base) e `valor_total`.
 * Medido: 9 registros de meta e 33 de realizado, com os três preenchidos em todos.
 * Derivar aqui funcionaria e esconderia que o dado existe — seria trocar leitura por
 * adivinhação sem necessidade.
 *
 * ⚠ NÃO HÁ SEGUNDO CAMINHO DE ESCRITA. Salva por `onSalvar(id, dados)`, que é
 * `useLancamentos.editarLancamento`. A lista branca aceita os doze campos desta tela —
 * conferido campo a campo; só `fazenda_id` não passa, e é por isso que a fazenda trava.
 *
 * ⚠ BOITEL NÃO CHEGA AQUI. O caller o exclui pelo mesmo predicado da criação.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CATEGORIAS, type Lancamento, type Categoria, type BasePrecoVenda } from '@/types/cattle';
import { useIntegerInput, useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import { VendaMetaModalShell } from './VendaMetaModalShell';

/** As três bases válidas. Fora delas, `por_kg` — o mesmo default do carregador antigo. */
const BASES: BasePrecoVenda[] = ['por_kg', 'por_cab', 'por_total'];
const baseDoRegistro = (v: string | undefined | null): BasePrecoVenda =>
  BASES.includes(v as BasePrecoVenda) ? (v as BasePrecoVenda) : 'por_kg';

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSalvar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => Promise<void>;
  p1Oficial?: boolean;
  temAlteracaoEstrutural?: (lanc: Lancamento, dados: Partial<Lancamento>) => boolean;
  /** Nome da fazenda DO REGISTRO (resolvido por UUID pelo caller). */
  nomeFazenda: string;
}

export function VendaMetaEdicaoModal({
  lancamento, open, onOpenChange, onSalvar, p1Oficial = false,
  temAlteracaoEstrutural, nomeFazenda,
}: Props) {
  const [data, setData] = useState(lancamento.data);
  const [quantidade, setQuantidade] = useState(String(lancamento.quantidade ?? ''));
  const [categoria, setCategoria] = useState<string>(lancamento.categoria ?? '');
  const [pesoKg, setPesoKg] = useState(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
  const [observacao, setObservacao] = useState(lancamento.observacao ?? '');
  const [compradorId, setCompradorId] = useState(lancamento.fornecedorId ?? '');
  const [notaFiscal, setNotaFiscal] = useState(lancamento.notaFiscal ?? '');
  const [vendaTipoPreco, setVendaTipoPreco] = useState<BasePrecoVenda>(baseDoRegistro(lancamento.tipoPeso));
  const [vendaPrecoInput, setVendaPrecoInput] = useState(lancamento.precoArroba != null ? String(lancamento.precoArroba) : '');
  const [vendaTipoVenda, setVendaTipoVenda] = useState(lancamento.tipoVenda ?? 'gado_adulto');
  const [saving, setSaving] = useState(false);

  /* Reabrir noutro lançamento tem de recarregar o formulário. */
  useEffect(() => {
    if (!open) return;
    setData(lancamento.data);
    setQuantidade(String(lancamento.quantidade ?? ''));
    setCategoria(lancamento.categoria ?? '');
    setPesoKg(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
    setObservacao(lancamento.observacao ?? '');
    setCompradorId(lancamento.fornecedorId ?? '');
    setNotaFiscal(lancamento.notaFiscal ?? '');
    setVendaTipoPreco(baseDoRegistro(lancamento.tipoPeso));
    setVendaPrecoInput(lancamento.precoArroba != null ? String(lancamento.precoArroba) : '');
    setVendaTipoVenda(lancamento.tipoVenda ?? 'gado_adulto');
  }, [open, lancamento]);

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const categoriasDisponiveis = useMemo(
    () => CATEGORIAS.map(c => ({ value: c.value as string, label: c.label })),
    [],
  );

  const vendaQtd = Number(quantidade) || 0;
  const vendaPeso = parseDecimalInput(pesoKg) ?? 0;

  /* ⚠ A MESMA COMPOSIÇÃO DO `calc.valorBruto` que a criação grava: a base decide o
     multiplicador, e nada mais entra — comissão, frete e funrural não existem em meta.
     NULL sem preço: sem valor previsto não se grava zero. */
  const precoNum = Number(String(vendaPrecoInput).replace(',', '.')) || 0;
  const valorPrevisto = precoNum > 0
    ? (vendaTipoPreco === 'por_kg'  ? (vendaQtd > 0 && vendaPeso > 0 ? Math.round(vendaQtd * vendaPeso * precoNum * 100) / 100 : null)
     : vendaTipoPreco === 'por_cab' ? (vendaQtd > 0 ? Math.round(vendaQtd * precoNum * 100) / 100 : null)
     : Math.round(precoNum * 100) / 100)
    : null;

  const handleSalvar = async () => {
    /* ⚠ SEM `cenario` NEM `statusOperacional`: o modal não tem seletor, e
       `editarLancamento` só envia campo `!== undefined` — omitir PRESERVA o gravado.
       ⚠ SEM `fazendaId`: a lista branca não o aceita, e é por isso que o campo trava. */
    const pesoFinal = vendaPeso > 0 ? vendaPeso : undefined;
    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data,
      tipo: 'venda',
      quantidade: vendaQtd,
      categoria: categoria as Categoria,
      pesoMedioKg: pesoFinal,
      pesoTotal: pesoFinal != null && vendaQtd > 0
        ? Math.round(vendaQtd * pesoFinal * 100) / 100
        : undefined,
      precoArroba: precoNum > 0 ? precoNum : undefined,
      tipoPeso: vendaTipoPreco,
      tipoVenda: vendaTipoVenda || undefined,
      fornecedorId: compradorId || undefined,
      notaFiscal: notaFiscal || undefined,
      valorTotal: valorPrevisto ?? undefined,
      precoUnitario: valorPrevisto != null && vendaQtd > 0
        ? Math.round((valorPrevisto / vendaQtd) * 100) / 100
        : undefined,
      observacao: observacao || undefined,
    };

    if (p1Oficial && temAlteracaoEstrutural && temAlteracaoEstrutural(lancamento, dados as Partial<Lancamento>)) {
      toast.error('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos estruturais (data, quantidade, categoria, fazenda) não podem ser alterados após o fechamento. Peso e observação podem ser editados.');
      return;
    }

    setSaving(true);
    try {
      await onSalvar(lancamento.id, dados);
      toast.success('Venda planejada atualizada.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao salvar venda: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-5xl p-0 gap-0 overflow-hidden [&>button.absolute]:hidden"
      >
        <VendaMetaModalShell
          modo="edicao"
          data={data}
          setData={setData}
          qtdInput={qtdInput}
          pesoInput={pesoInput}
          categoria={categoria}
          setCategoria={(v: Categoria) => setCategoria(v)}
          categoriasDisponiveis={categoriasDisponiveis}
          observacao={observacao}
          setObservacao={setObservacao}
          compradorId={compradorId}
          setCompradorId={setCompradorId}
          contrapartes={[]}
          clienteIdParaContraparte={lancamento.clienteId ?? ''}
          notaFiscal={notaFiscal}
          setNotaFiscal={setNotaFiscal}
          vendaTipoPreco={vendaTipoPreco}
          setVendaTipoPreco={setVendaTipoPreco}
          vendaPrecoInput={vendaPrecoInput}
          setVendaPrecoInput={setVendaPrecoInput}
          vendaTipoVenda={vendaTipoVenda}
          setVendaTipoVenda={setVendaTipoVenda}
          /* Fazenda travada: o campo mostra o nome e não há seletor. */
          vendaFazendaId={lancamento.fazendaId ?? ''}
          setVendaFazendaId={() => { /* travado — ver VendaMetaModalShell */ }}
          fazendasOC={[]}
          vendaFazendaNome={nomeFazenda || null}
          vendaFazendaFalta={false}
          vendaQtd={vendaQtd}
          vendaPeso={vendaPeso}
          valorPrevisto={valorPrevisto}
          submitting={saving}
          handleRequestRegister={handleSalvar}
          fecharModalOCComAutosave={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * CompraMetaEdicaoModal — a EDIÇÃO de uma compra em META, no mesmo modal que a registra.
 *
 * PR-ZOO-META-COMPRA-EDICAO-01, no padrão do NascimentoEdicaoModal e do MorteEdicaoModal.
 * Até aqui, editar uma compra de meta abria o modal com abas do realizado — Custos da
 * Operação, Itens, Auditoria, o bloco de Vínculo Financeiro e o rodapé "Salvar e Gerar
 * Financeiro". Criar já tinha migrado; editar, não.
 *
 * ⚠ O PLANO FINANCEIRO DE META NÃO SUMIU DO SISTEMA. Medido: 53 linhas de
 * `financeiro_lancamentos_v2` nascem de lançamentos de meta, e 52 delas têm
 * `cenario='meta'` do lado financeiro — é planejamento de caixa legítimo, não lixo, e
 * nenhuma está paga. Este modal apenas não traz esses blocos para dentro do formulário
 * de projeção: eles continuam existindo e sendo geridos por onde já são.
 *
 * ⚠ NÃO HÁ SEGUNDO CAMINHO DE ESCRITA. Salva por `onSalvar(id, dados)`, que é
 * `useLancamentos.editarLancamento` — o mesmo do nascimento e da morte. A lista branca
 * dele aceita todos os campos desta tela, inclusive `fornecedorId`; só `fazenda_id` não
 * passa, e é por isso que a fazenda fica travada.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CATEGORIAS, type Lancamento, type Categoria } from '@/types/cattle';
import { useIntegerInput, useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import { CompraMetaModalShell } from './CompraMetaModalShell';

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

export function CompraMetaEdicaoModal({
  lancamento, open, onOpenChange, onSalvar, p1Oficial = false,
  temAlteracaoEstrutural, nomeFazenda,
}: Props) {
  /* ⚠ O PRECO VOLTA COMO R$/kg, e nao como total. A tela pede preço por quilo, e o banco
     guarda o total — reabrir com o total no campo de preço multiplicaria de novo a cada
     salvamento. Deriva-se do que existe: total ÷ peso total. */
  const pesoTotalGravado = (lancamento.quantidade || 0) * (lancamento.pesoMedioKg || 0);
  const precoKgInicial = lancamento.valorTotal != null && pesoTotalGravado > 0
    ? String(Math.round((lancamento.valorTotal / pesoTotalGravado) * 100) / 100)
    : '';

  const [data, setData] = useState(lancamento.data);
  const [quantidade, setQuantidade] = useState(String(lancamento.quantidade ?? ''));
  const [categoria, setCategoria] = useState<string>(lancamento.categoria ?? '');
  const [pesoKg, setPesoKg] = useState(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
  const [observacao, setObservacao] = useState(lancamento.observacao ?? '');
  const [fazendaOrigem, setFazendaOrigem] = useState(lancamento.fazendaOrigem ?? '');
  const [compraFornecedorId, setCompraFornecedorId] = useState(lancamento.fornecedorId ?? '');
  const [notaFiscal, setNotaFiscal] = useState(lancamento.notaFiscal ?? '');
  const [precoKgBase, setPrecoKgBase] = useState(precoKgInicial);
  const [bonus, setBonus] = useState(lancamento.acrescimos != null ? String(lancamento.acrescimos) : '');
  const [descontos, setDescontos] = useState(lancamento.deducoes != null ? String(lancamento.deducoes) : '');
  const [saving, setSaving] = useState(false);

  /* Reabrir noutro lançamento tem de recarregar o formulário — sem isto o estado do
     anterior sobreviveria e a tela mostraria dados de outro registro. */
  useEffect(() => {
    if (!open) return;
    const pesoTot = (lancamento.quantidade || 0) * (lancamento.pesoMedioKg || 0);
    setData(lancamento.data);
    setQuantidade(String(lancamento.quantidade ?? ''));
    setCategoria(lancamento.categoria ?? '');
    setPesoKg(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
    setObservacao(lancamento.observacao ?? '');
    setFazendaOrigem(lancamento.fazendaOrigem ?? '');
    setCompraFornecedorId(lancamento.fornecedorId ?? '');
    setNotaFiscal(lancamento.notaFiscal ?? '');
    setPrecoKgBase(lancamento.valorTotal != null && pesoTot > 0
      ? String(Math.round((lancamento.valorTotal / pesoTot) * 100) / 100) : '');
    setBonus(lancamento.acrescimos != null ? String(lancamento.acrescimos) : '');
    setDescontos(lancamento.deducoes != null ? String(lancamento.deducoes) : '');
  }, [open, lancamento]);

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const categoriasDisponiveis = useMemo(
    () => CATEGORIAS.map(c => ({ value: c.value as string, label: c.label })),
    [],
  );

  const compraQtd = Number(quantidade) || 0;
  const compraPeso = parseDecimalInput(pesoKg) ?? 0;

  /* ⚠ A MESMA COMPOSICAO DO CAMINHO DE CRIACAO: peso total × R$/kg + bônus − descontos.
     O caller da criação passa `calc.valorLiquido`, que para uma compra é exatamente
     isto; aqui não há `calc`, então a conta é escrita — e tem de continuar batendo.
     NULL quando não há preço: sem valor previsto não se grava zero. */
  const pesoTotal = compraQtd > 0 && compraPeso > 0 ? compraQtd * compraPeso : null;
  const precoKgNum = Number(String(precoKgBase).replace(',', '.')) || 0;
  const valorPrevisto = pesoTotal != null && precoKgNum > 0
    ? Math.round((pesoTotal * precoKgNum + (Number(bonus) || 0) - (Number(descontos) || 0)) * 100) / 100
    : null;

  const handleSalvar = async () => {
    /* ⚠ SEM `cenario` NEM `statusOperacional`: o modal não tem seletor, e
       `editarLancamento` só envia campo `!== undefined` — omitir PRESERVA o gravado.
       ⚠ SEM `fazendaId`: a lista branca não o aceita, e é por isso que o campo trava. */
    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data,
      tipo: 'compra',
      quantidade: compraQtd,
      categoria: categoria as Categoria,
      fazendaOrigem: fazendaOrigem || undefined,
      fornecedorId: compraFornecedorId || undefined,
      notaFiscal: notaFiscal || undefined,
      pesoMedioKg: compraPeso > 0 ? compraPeso : undefined,
      pesoTotal: pesoTotal ?? undefined,
      acrescimos: bonus !== '' ? Number(bonus) : undefined,
      deducoes: descontos !== '' ? Number(descontos) : undefined,
      valorTotal: valorPrevisto ?? undefined,
      precoUnitario: valorPrevisto != null && compraQtd > 0
        ? Math.round((valorPrevisto / compraQtd) * 100) / 100
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
      toast.success('Compra planejada atualizada.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao salvar compra: ' + (e?.message || 'erro desconhecido'));
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
        <CompraMetaModalShell
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
          fazendaOrigem={fazendaOrigem}
          setFazendaOrigem={setFazendaOrigem}
          compraFornecedorId={compraFornecedorId}
          setCompraFornecedorId={setCompraFornecedorId}
          fornecedores={[]}
          clienteIdParaFornecedor={lancamento.clienteId ?? ''}
          notaFiscal={notaFiscal}
          setNotaFiscal={setNotaFiscal}
          precoKgBase={precoKgBase}
          setPrecoKgBase={setPrecoKgBase}
          bonus={bonus}
          setBonus={setBonus}
          descontos={descontos}
          setDescontos={setDescontos}
          /* Fazenda travada: o campo mostra o nome e não há seletor. O id vai junto só
             para manter a forma do prop-bag — nada o lê no modo edição. */
          compraFazendaId={lancamento.fazendaId ?? ''}
          setCompraFazendaId={() => { /* travado — ver CompraMetaModalShell */ }}
          fazendasOC={[]}
          compraFazendaNome={nomeFazenda || null}
          compraFazendaFalta={false}
          compraQtd={compraQtd}
          compraPeso={compraPeso}
          valorPrevisto={valorPrevisto}
          submitting={saving}
          handleRequestRegister={handleSalvar}
          fecharModalOCComAutosave={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

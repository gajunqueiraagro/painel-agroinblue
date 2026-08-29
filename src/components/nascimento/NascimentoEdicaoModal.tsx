/**
 * NascimentoEdicaoModal — a EDIÇÃO de um nascimento, no mesmo modal que o cria.
 *
 * PR-ZOO-EDICAO-NO-MODAL-01. Até aqui a edição abria `EditNascimentoSheet`, uma gaveta
 * lateral com layout próprio: título sobre fundo branco, cabeçalho "📋 DADOS
 * ZOOTÉCNICOS", rótulos em negrito, `input type="date"` nativo, botão amarelo. Criar e
 * editar o mesmo lançamento pareciam dois sistemas diferentes.
 *
 * Este componente NÃO desenha nada: monta o estado do formulário a partir do registro
 * e entrega ao `NascimentoModalShell`, o mesmo do LancamentosTab. Toda a marcação vive
 * lá, uma vez só.
 *
 * ⚠ NÃO HÁ SEGUNDO CAMINHO DE ESCRITA. Salva por `onSalvar(id, dados)`, que é
 * `useLancamentos.editarLancamento` — o mesmo que a gaveta já usava, com o mesmo
 * payload, construído abaixo a partir de `EditNascimentoSheet.handleSalvar`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CATEGORIAS, kgToArrobas, type Lancamento, type Categoria } from '@/types/cattle';
import { useIntegerInput, useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import { NascimentoModalShell } from './NascimentoModalShell';

const CATEGORIAS_NASCIMENTO: Categoria[] = ['mamotes_m', 'mamotes_f'];

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `useLancamentos.editarLancamento`. Mesma assinatura da gaveta. */
  onSalvar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => Promise<void>;
  /** P1 oficial fechado para o mês — bloqueia campos estruturais. */
  p1Oficial?: boolean;
  temAlteracaoEstrutural?: (lanc: Lancamento, dados: Partial<Lancamento>) => boolean;
  /** Nome da fazenda DO REGISTRO (resolvido por UUID pelo caller). */
  nomeFazenda: string;
}

export function NascimentoEdicaoModal({
  lancamento, open, onOpenChange, onSalvar, p1Oficial = false,
  temAlteracaoEstrutural, nomeFazenda,
}: Props) {
  const [data, setData] = useState(lancamento.data);
  const [quantidade, setQuantidade] = useState(String(lancamento.quantidade ?? ''));
  const [categoria, setCategoria] = useState<string>(lancamento.categoria ?? '');
  const [pesoKg, setPesoKg] = useState(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
  const [observacao, setObservacao] = useState(lancamento.observacao ?? '');
  const [saving, setSaving] = useState(false);

  /* Reabrir o modal noutro lançamento tem de recarregar o formulário. Sem isto o
     estado do anterior sobreviveria e a tela mostraria dados de outro registro. */
  useEffect(() => {
    if (!open) return;
    setData(lancamento.data);
    setQuantidade(String(lancamento.quantidade ?? ''));
    setCategoria(lancamento.categoria ?? '');
    setPesoKg(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
    setObservacao(lancamento.observacao ?? '');
  }, [open, lancamento]);

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const categoriasDisponiveis = useMemo(
    () => CATEGORIAS.filter(c => CATEGORIAS_NASCIMENTO.includes(c.value as Categoria)),
    [],
  );

  const nascQtd = Number(quantidade) || 0;
  const nascPeso = parseDecimalInput(pesoKg) ?? 0;

  const handleSalvar = async () => {
    /* Payload copiado de EditNascimentoSheet.handleSalvar, inclusive o peso default de
       30 kg e a fórmula do peso total (PR-EditZooSheets-PesoTotal-V2).
       ⚠ SEM `cenario` NEM `statusOperacional`: o modal não tem seletor de cenário, e
       `editarLancamento` só envia campo `!== undefined` — omitir PRESERVA o gravado.
       Enviá-los a partir de um controle que não existe é que seria invenção.
       ⚠ SEM `fazendaId`: `editarLancamento` não move lançamento entre fazendas. */
    const pesoFinal = nascPeso > 0 ? nascPeso : 30;
    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data,
      tipo: 'nascimento',
      quantidade: nascQtd,
      categoria: categoria as Categoria,
      fazendaDestino: nomeFazenda,
      pesoMedioKg: pesoFinal,
      pesoMedioArrobas: kgToArrobas(pesoFinal),
      pesoTotal: pesoFinal && nascQtd > 0
        ? Math.round(nascQtd * pesoFinal * 100) / 100
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
      toast.success('Nascimento atualizado.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao salvar nascimento: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Envelope idêntico ao da criação no LancamentosTab: sem padding próprio, sem
          gap e com o X nativo escondido — quem fecha é o X do cabeçalho azul. */}
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-5xl p-0 gap-0 overflow-hidden [&>button.absolute]:hidden"
      >
        <NascimentoModalShell
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
          /* Fazenda travada: o campo mostra o nome e não há seletor. O id vai junto
             só para manter a forma do prop-bag — nada o lê no modo edição. */
          nascFazendaId={lancamento.fazendaId ?? ''}
          setNascFazendaId={() => { /* travado — ver NascimentoModalShell */ }}
          fazendasOC={[]}
          nascFazendaNome={nomeFazenda || null}
          nascFazendaFalta={false}
          nascQtd={nascQtd}
          nascPeso={nascPeso}
          cenario={lancamento.cenario === 'meta' ? 'meta' : 'realizado'}
          submitting={saving}
          handleRequestRegister={handleSalvar}
          fecharModalOCComAutosave={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

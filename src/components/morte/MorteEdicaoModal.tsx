/**
 * MorteEdicaoModal — a EDIÇÃO de uma morte, no mesmo modal que a registra.
 *
 * PR-ZOO-MORTE-NO-SHELL-01, no padrão do NascimentoEdicaoModal. Até aqui a edição
 * abria `EditMorteSheet`, gaveta lateral com layout próprio.
 *
 * ⚠ NÃO HÁ SEGUNDO CAMINHO DE ESCRITA. Salva por `onSalvar(id, dados)`, que é
 * `useLancamentos.editarLancamento` — o mesmo que a gaveta já usava.
 *
 * ⚠ O MOTIVO MORA EM `fazendaDestino`. Não é escolha deste PR: é a regra zoot já
 * existente, que `EditMorteSheet` seguia (`fazendaDestino: motivoFinal`) e que o
 * caminho de criação também usa. Mudar o armazenamento seria frente própria.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CATEGORIAS, kgToArrobas, type Lancamento, type Categoria } from '@/types/cattle';
import { useIntegerInput, useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import { MorteModalShell } from './MorteModalShell';

/** Mesma lista do caminho de criação (LancamentosTab). */
export const MOTIVOS_MORTE = [
  'Raio', 'Picada de cobra', 'Doença respiratória', 'Tristeza parasitária',
  'Clostridiose', 'Intoxicação por planta', 'Acidente', 'Desidratação',
  'Parto distócico', 'Ataque de animal', 'Causa desconhecida',
];

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

export function MorteEdicaoModal({
  lancamento, open, onOpenChange, onSalvar, p1Oficial = false,
  temAlteracaoEstrutural, nomeFazenda,
}: Props) {
  /* O motivo está gravado em `fazendaDestino`, com fallback em observação — a mesma
     leitura que `EditMorteSheet` fazia. Motivo fora da lista abre em "Outro". */
  const motivoGravado = lancamento.fazendaDestino || '';
  const motivoEhPreset = MOTIVOS_MORTE.includes(motivoGravado);

  const [data, setData] = useState(lancamento.data);
  const [quantidade, setQuantidade] = useState(String(lancamento.quantidade ?? ''));
  const [categoria, setCategoria] = useState<string>(lancamento.categoria ?? '');
  const [pesoKg, setPesoKg] = useState(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
  const [observacao, setObservacao] = useState(lancamento.observacao ?? '');
  const [motivoMorte, setMotivoMorte] = useState(motivoEhPreset ? motivoGravado : (motivoGravado ? '__custom__' : ''));
  const [motivoMorteCustom, setMotivoMorteCustom] = useState(motivoEhPreset ? '' : motivoGravado);
  const [valorMorte, setValorMorte] = useState<number | null>(lancamento.valorTotal ?? null);
  const [saving, setSaving] = useState(false);

  /* Reabrir noutro lançamento tem de recarregar o formulário — sem isto o estado do
     anterior sobreviveria e a tela mostraria dados de outro registro. */
  useEffect(() => {
    if (!open) return;
    const gravado = lancamento.fazendaDestino || '';
    const preset = MOTIVOS_MORTE.includes(gravado);
    setData(lancamento.data);
    setQuantidade(String(lancamento.quantidade ?? ''));
    setCategoria(lancamento.categoria ?? '');
    setPesoKg(lancamento.pesoMedioKg != null ? String(lancamento.pesoMedioKg) : '');
    setObservacao(lancamento.observacao ?? '');
    setMotivoMorte(preset ? gravado : (gravado ? '__custom__' : ''));
    setMotivoMorteCustom(preset ? '' : gravado);
    setValorMorte(lancamento.valorTotal ?? null);
  }, [open, lancamento]);

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const categoriasDisponiveis = useMemo(
    () => CATEGORIAS.map(c => ({ value: c.value as string, label: c.label })),
    [],
  );

  const morteQtd = Number(quantidade) || 0;
  const mortePeso = parseDecimalInput(pesoKg) ?? 0;

  const handleSalvar = async () => {
    const motivoFinal = motivoMorte === '__custom__' ? motivoMorteCustom : motivoMorte;
    /* ⚠ SEM `cenario` NEM `statusOperacional`: o modal não tem seletor de cenário, e
       `editarLancamento` só envia campo `!== undefined` — omitir PRESERVA o gravado.
       ⚠ SEM `fazendaId`: `editarLancamento` não move lançamento entre fazendas.
       ⚠ `valorTotal` vai `undefined` quando não informado, e a lista branca o omite:
       o campo fica como está no banco em vez de virar zero. */
    const pesoFinal = mortePeso > 0 ? mortePeso : undefined;
    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data,
      tipo: 'morte',
      quantidade: morteQtd,
      categoria: categoria as Categoria,
      fazendaDestino: motivoFinal || undefined,
      pesoMedioKg: pesoFinal,
      pesoMedioArrobas: pesoFinal != null ? kgToArrobas(pesoFinal) : undefined,
      pesoTotal: pesoFinal != null && morteQtd > 0
        ? Math.round(morteQtd * pesoFinal * 100) / 100
        : undefined,
      observacao: observacao || undefined,
      valorTotal: valorMorte ?? undefined,
    };

    if (p1Oficial && temAlteracaoEstrutural && temAlteracaoEstrutural(lancamento, dados as Partial<Lancamento>)) {
      toast.error('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos estruturais (data, quantidade, categoria, fazenda) não podem ser alterados após o fechamento. Peso e observação podem ser editados.');
      return;
    }

    setSaving(true);
    try {
      await onSalvar(lancamento.id, dados);
      toast.success('Morte atualizada.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao salvar morte: ' + (e?.message || 'erro desconhecido'));
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
        <MorteModalShell
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
          morteFazendaId={lancamento.fazendaId ?? ''}
          setMorteFazendaId={() => { /* travado — ver MorteModalShell */ }}
          fazendasOC={[]}
          morteFazendaNome={nomeFazenda || null}
          morteFazendaFalta={false}
          motivoMorte={motivoMorte}
          setMotivoMorte={setMotivoMorte}
          motivoMorteCustom={motivoMorteCustom}
          setMotivoMorteCustom={setMotivoMorteCustom}
          motivosDisponiveis={MOTIVOS_MORTE}
          valorMorte={valorMorte}
          setValorMorte={setValorMorte}
          morteQtd={morteQtd}
          mortePeso={mortePeso}
          cenario={lancamento.cenario === 'meta' ? 'meta' : 'realizado'}
          submitting={saving}
          handleRequestRegister={handleSalvar}
          fecharModalOCComAutosave={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

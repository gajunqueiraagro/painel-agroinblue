import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ExternalLink, Loader2 } from 'lucide-react';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { CHAVE_SITUACAO_DO_CONTRATO } from '@/hooks/useSituacaoDoContrato';
import { MOTIVO_OBRIGATORIO, motivoInformado } from '@/lib/financeiro/cancelamentoLancamento';
import {
  antesDepois, caminhoInicial, caminhosDoCancelamento, dadosDaParcela, rotuloDoBotao, tituloDoCancelamento,
  type EscopoDoCancelamento, type PreviaCancelarParcela,
} from '@/lib/financiamentos/cancelarParcela';
import { gravarCancelarParcela, simularCancelarParcela, type AlvoDoCancelamento } from '@/lib/financiamentos/cancelarParcelaBanco';

/**
 * O AVISO DE QUE O LANÇAMENTO É PARCELA DE COMPRA PARCELADA — PARC-CADEIA-01 passo 2 (Gabriel, 07/10/2026: "se eu for apagar
 * uma parcela, ele tem que dar um aviso de que faz parte de uma compra parcelada, se é para cancelar só essa ou todas,
 * direcionar para a tela pai").
 *
 * UM diálogo, aberto por toda porta que cancela lançamento quando o banco diz que ele é parcela viva de parcelamento.
 * ⚠ OS NÚMEROS SÃO OS DO BANCO: `previa` é a simulação de "só esta" (a mesma função que grava); a de "a compra inteira" é
 *   pedida ao abrir. Trocar o caminho só troca qual prévia vale — nada é calculado aqui.
 * ⚠ TAMANHO FIXO: toda linha que aparece por condição tem lugar reservado; o caminho recusado fica APAGADO com a frase.
 * A recusa do banco na gravação fica ESCRITA ao lado do botão — nunca em toast.
 */
interface Props {
  clienteId: string;
  alvo: AlvoDoCancelamento;
  /** a simulação de "só esta", que a porta já pediu para saber que é parcela */
  previa: PreviaCancelarParcela;
  /** fecha sem gravar nada */
  aoVoltar: () => void;
  /** gravou: a porta fecha o que estiver aberto */
  aoGravar: (escopo: EscopoDoCancelamento) => void;
  /** ausente = a pessoa não acessa a tela do contrato (ou a porta não navega): o atalho não é oferecido */
  aoAbrirContrato?: (financiamentoId: string) => void;
}

const TH = 'h-[18px] bg-primary px-1.5 py-0 text-left text-[9.5px] font-semibold text-primary-foreground';
const TD = 'h-[18px] px-1.5 py-0 text-[10px] leading-[17px] tabular-nums whitespace-nowrap';

export function CancelarParcelaDialog({ clienteId, alvo, previa, aoVoltar, aoGravar, aoAbrirContrato }: Props) {
  const qc = useQueryClient();
  const [todas, setTodas] = useState<PreviaCancelarParcela | null>(null);
  const [erroDeTodas, setErroDeTodas] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<EscopoDoCancelamento | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  const { lancamentoId, parcelaId } = alvo;
  useEffect(() => {
    let vivo = true;
    void simularCancelarParcela({ lancamentoId, parcelaId }, 'todas').then(r => {
      if (!vivo) return;
      if (r.previa) setTodas(r.previa); else setErroDeTodas(r.erro);
    });
    return () => { vivo = false; };
  }, [lancamentoId, parcelaId]);

  const caminhos = caminhosDoCancelamento(previa, todas, erroDeTodas);
  const escopo = escolha ?? caminhoInicial(caminhos);
  const caminho = caminhos.find(c => c.escopo === escopo) ?? null;
  const vale = escopo === 'todas' ? todas : previa;
  const linhas = antesDepois(vale && escopo ? vale : previa);
  const dados = dadosDaParcela(previa);
  const titulo = tituloDoCancelamento(previa);
  const motivoOk = motivoInformado(motivo);
  const porQueNao = !caminho ? 'Nenhum caminho disponível.' : caminho.recusa ? caminho.recusa : !motivoOk ? MOTIVO_OBRIGATORIO : null;

  const gravar = async () => {
    if (!escopo || !motivoOk || porQueNao) return;
    setOcupado(true); setRecusa(null);
    try {
      const erro = await gravarCancelarParcela(alvo, escopo, motivoOk);
      if (erro) { setRecusa(erro); return; }
      notificarLancamentosMudaram(clienteId);
      for (const chave of ['cpr-lancs', 'cpr-caixa', 'financiamentos-lista', CHAVE_SITUACAO_DO_CONTRATO, 'financiamento-parcelas',
        'financiamento-detalhe', 'obrigacao-edicao', 'obrigacao-edicao-parcelas', 'obrigacao-edicao-lancamentos']) {
        void qc.invalidateQueries({ queryKey: [chave] });
      }
      aoGravar(escopo);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={o => { if (!o && !ocupado) aoVoltar(); }}>
      <AlertDialogContent className="h-[330px] w-[94vw] max-w-[560px] gap-0 overflow-hidden p-0" data-testid="cancelar-parcela">
        <AlertDialogHeader className="h-[52px] shrink-0 space-y-0 border-b bg-primary/10 px-4 py-2 text-left">
          <AlertDialogTitle className="truncate text-[14px] font-medium leading-[18px] text-primary" title={titulo} data-testid="cancelar-parcela-titulo">
            {titulo}
          </AlertDialogTitle>
          {/* as classes de fonte vão na Description (o `cn` dela resolve o conflito com o `text-sm` padrão) */}
          <AlertDialogDescription asChild className="mt-0.5 text-[10px] leading-[16px] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-1.5" data-testid="cancelar-parcela-dados">
              <span className="min-w-0 truncate" title={dados.credor}>{dados.credor}</span>
              <span className="shrink-0 whitespace-nowrap">· {dados.nota}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">· venc. {dados.vencimento}</span>
              <span className="shrink-0 whitespace-nowrap font-medium tabular-nums text-foreground">· {dados.valor}</span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex h-[232px] flex-col gap-2 px-4 py-2.5">
          <p className="h-[14px] shrink-0 truncate text-[10px] leading-[14px] text-amber-700">
            Este lançamento faz parte de uma compra parcelada: o contrato é ajustado junto.
          </p>
          <table className="w-full shrink-0 table-fixed border-collapse" data-testid="cancelar-parcela-antes-depois">
            <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 150 }} /></colgroup>
            <thead>
              <tr>
                <th className={TH}>O que muda no contrato</th>
                <th className={`${TH} text-right`}>Hoje</th>
                <th className={`${TH} text-right`}>Depois</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.rotulo} className="border-b">
                  <td className={`${TD} font-medium`}>{l.rotulo}</td>
                  <td className={`${TD} text-right text-muted-foreground`}>{l.antes}</td>
                  <td className={`${TD} text-right font-semibold`} data-testid={`depois-${l.rotulo}`}>{escopo ? l.depois : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <RadioGroup className="shrink-0 gap-1" value={escopo ?? ''} onValueChange={v => {
            const c = caminhos.find(x => x.escopo === v && !x.recusa); if (c) { setEscolha(c.escopo); setRecusa(null); }
          }}>
            {caminhos.map(c => (
              <div key={c.escopo} className={`flex h-[30px] items-start gap-2 ${c.recusa ? 'opacity-60' : ''}`} data-testid={`caminho-${c.escopo}`}>
                <RadioGroupItem value={c.escopo} id={`cancelar-parcela-${c.escopo}`} className="mt-0.5" disabled={!!c.recusa} />
                <Label htmlFor={`cancelar-parcela-${c.escopo}`} className={`min-w-0 flex-1 font-normal leading-snug ${c.recusa ? '' : 'cursor-pointer'}`}>
                  <span className="block truncate text-[11px] font-medium leading-[14px]">{c.rotulo}</span>
                  <span className={`block truncate text-[10px] leading-[14px] ${c.recusa ? 'text-destructive' : 'text-muted-foreground'}`}
                    title={c.recusa ?? c.explica} data-testid={`caminho-${c.escopo}-frase`}>
                    {c.recusa ?? c.explica}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="flex h-[22px] shrink-0 items-center gap-2">
            <Label htmlFor="cancelar-parcela-motivo" className="shrink-0 text-[10px] font-medium">Motivo *</Label>
            <Input id="cancelar-parcela-motivo" value={motivo} onChange={e => { setMotivo(e.target.value); setRecusa(null); }}
              className="h-[22px] min-w-0 flex-1 px-1.5 text-[10px]" placeholder="Por que está cancelando" maxLength={200}
              data-testid="cancelar-parcela-motivo" />
          </div>

          {/* lugar FIXO: o atalho para a tela pai só existe para quem a acessa */}
          <div className="h-[16px] shrink-0">
            {aoAbrirContrato && (
              <button type="button" className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                onClick={() => aoAbrirContrato(previa.contrato.id)} data-testid="cancelar-parcela-abrir-contrato"
                title="Abre a tela do contrato; ao voltar, você retorna para onde estava">
                <ExternalLink className="h-3 w-3" /> Abrir o contrato
              </button>
            )}
          </div>
        </div>

        <AlertDialogFooter className="h-[46px] shrink-0 flex-row items-center gap-2 space-x-0 border-t bg-accent px-4 py-0 sm:justify-end">
          <span className={`mr-auto min-w-0 truncate text-[10px] ${recusa ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
            data-testid="cancelar-parcela-recado" title={recusa ?? porQueNao ?? undefined}>
            {recusa ?? porQueNao ?? ''}
          </span>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={aoVoltar} title="Fecha sem gravar nada" data-testid="cancelar-parcela-voltar">Voltar</Button>
          <Button type="button" size="sm" variant="destructive" className="gap-1.5" disabled={ocupado || !!porQueNao}
            title={porQueNao ?? undefined} onClick={() => { void gravar(); }} data-testid="cancelar-parcela-gravar">
            {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {rotuloDoBotao(escopo)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

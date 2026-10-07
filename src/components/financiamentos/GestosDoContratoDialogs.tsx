import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { MOTIVO_OBRIGATORIO, motivoInformado } from '@/lib/financeiro/cancelamentoLancamento';
import {
  dadosDoRecriar, fraseDoExcluir, fraseDoMolde, type PreviaExcluirCompra, type PreviaRecriar,
} from '@/lib/financiamentos/cancelarParcela';
import {
  gravarExcluirCompra, gravarRecriarLancamento, simularExcluirCompra, simularRecriarLancamento,
} from '@/lib/financiamentos/cancelarParcelaBanco';

/**
 * OS DOIS GESTOS DA TELA DO CONTRATO QUE MEXEM NA CADEIA — PARC-CADEIA-01 passo 4.
 *   · EXCLUIR A COMPRA (parcelamento): `fn_parcelamento_excluir`, uma transação — sai o import() dinâmico e as três idas soltas.
 *   · RECRIAR O LANÇAMENTO de uma parcela viva que ficou sem ele: `fn_parcelamento_recriar_lancamento`.
 * Os dois dizem o que vão fazer ANTES (a simulação é a própria função), têm tamanho FIXO e escrevem a recusa do banco ao lado
 * do botão — nunca em toast. Nenhum número é calculado aqui.
 */

const CAIXA = 'w-[94vw] max-w-[500px] gap-0 overflow-hidden p-0';
const CABECA = 'h-[52px] shrink-0 space-y-0 border-b bg-primary/10 px-4 py-2 text-left';
const TITULO = 'truncate text-[14px] font-medium leading-[18px] text-primary';
const SUB = 'mt-0.5 truncate text-[10px] leading-[16px] text-muted-foreground';
const RODAPE = 'h-[46px] shrink-0 flex-row items-center gap-2 space-x-0 border-t bg-accent px-4 py-0 sm:justify-end';

export function ExcluirCompraDialog({ financiamentoId, descricao, aoVoltar, aoExcluir }: {
  financiamentoId: string; descricao: string; aoVoltar: () => void; aoExcluir: (previa: PreviaExcluirCompra) => void;
}) {
  const [previa, setPrevia] = useState<PreviaExcluirCompra | null>(null);
  const [erroDaPrevia, setErroDaPrevia] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void simularExcluirCompra(financiamentoId).then(r => {
      if (!vivo) return;
      if (r.previa) setPrevia(r.previa); else setErroDaPrevia(r.erro);
    });
    return () => { vivo = false; };
  }, [financiamentoId]);

  const motivoOk = motivoInformado(motivo);
  const recusaDaPrevia = previa?.recusa?.frase ?? erroDaPrevia;
  const porQueNao = !previa && !erroDaPrevia ? 'Calculando…' : recusaDaPrevia ? recusaDaPrevia : !motivoOk ? MOTIVO_OBRIGATORIO : null;

  const gravar = async () => {
    if (!previa || !motivoOk || porQueNao) return;
    setOcupado(true); setRecusa(null);
    try {
      const erro = await gravarExcluirCompra(financiamentoId, motivoOk);
      if (erro) { setRecusa(erro); return; }
      aoExcluir(previa);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={o => { if (!o && !ocupado) aoVoltar(); }}>
      <AlertDialogContent className={`${CAIXA} h-[210px]`} data-testid="excluir-compra">
        <AlertDialogHeader className={CABECA}>
          <AlertDialogTitle className={TITULO} title={`Excluir a compra parcelada «${descricao}»`}>Excluir a compra parcelada «{descricao}»</AlertDialogTitle>
          <AlertDialogDescription className={SUB}>Todos os lançamentos das parcelas saem juntos, numa gravação só.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex h-[112px] flex-col gap-2 px-4 py-3">
          {/* lugar FIXO de duas linhas: o que vai acontecer (números do banco), ou a recusa */}
          <p className={`h-[30px] shrink-0 overflow-hidden text-[11px] leading-[15px] ${recusaDaPrevia ? 'text-destructive' : 'text-foreground'}`}
            data-testid="excluir-compra-previa" title={recusaDaPrevia ?? (previa ? fraseDoExcluir(previa) : undefined)}>
            {recusaDaPrevia ?? (previa ? fraseDoExcluir(previa) : 'Calculando o que será cancelado…')}
          </p>
          <div className="flex h-[22px] shrink-0 items-center gap-2">
            <Label htmlFor="excluir-compra-motivo" className="shrink-0 text-[10px] font-medium">Motivo *</Label>
            <Input id="excluir-compra-motivo" value={motivo} onChange={e => { setMotivo(e.target.value); setRecusa(null); }}
              className="h-[22px] min-w-0 flex-1 px-1.5 text-[10px]" placeholder="Por que está excluindo" maxLength={200} data-testid="excluir-compra-motivo" />
          </div>
        </div>
        <AlertDialogFooter className={RODAPE}>
          <span className={`mr-auto min-w-0 truncate text-[10px] ${recusa ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
            data-testid="excluir-compra-recado" title={recusa ?? porQueNao ?? undefined}>
            {recusa ?? (recusaDaPrevia ? '' : (porQueNao ?? ''))}
          </span>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={aoVoltar} title="Fecha sem gravar nada">Voltar</Button>
          <Button type="button" size="sm" variant="destructive" className="gap-1.5" disabled={ocupado || !!porQueNao}
            title={porQueNao ?? undefined} onClick={() => { void gravar(); }} data-testid="excluir-compra-gravar">
            {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Excluir a compra
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RecriarLancamentoDialog({ parcelaId, aoVoltar, aoRecriar }: {
  parcelaId: string; aoVoltar: () => void; aoRecriar: () => void;
}) {
  const [previa, setPrevia] = useState<PreviaRecriar | null>(null);
  const [erroDaPrevia, setErroDaPrevia] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void simularRecriarLancamento(parcelaId).then(r => {
      if (!vivo) return;
      if (r.previa) setPrevia(r.previa); else setErroDaPrevia(r.erro);
    });
    return () => { vivo = false; };
  }, [parcelaId]);

  const recusaDaPrevia = previa?.recusa?.frase ?? erroDaPrevia;
  const porQueNao = !previa && !erroDaPrevia ? 'Calculando…' : recusaDaPrevia;
  const dados = previa ? dadosDoRecriar(previa) : null;

  const gravar = async () => {
    if (!previa || porQueNao) return;
    setOcupado(true); setRecusa(null);
    try {
      const erro = await gravarRecriarLancamento(parcelaId);
      if (erro) { setRecusa(erro); return; }
      aoRecriar();
    } finally {
      setOcupado(false);
    }
  };

  const titulo = previa ? `Recriar o lançamento da parcela ${previa.parcela.numero}/${previa.parcela.total}` : 'Recriar o lançamento da parcela';
  return (
    <AlertDialog open onOpenChange={o => { if (!o && !ocupado) aoVoltar(); }}>
      <AlertDialogContent className={`${CAIXA} h-[190px]`} data-testid="recriar-lancamento">
        <AlertDialogHeader className={CABECA}>
          <AlertDialogTitle className={TITULO} title={titulo}>{titulo}</AlertDialogTitle>
          <AlertDialogDescription className={SUB}>Nasce um lançamento novo, programado; o cancelado não é reativado.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex h-[92px] flex-col gap-1.5 px-4 py-3">
          {/* lugares FIXOS: o lançamento que vai nascer (do banco), e de onde vem a classificação — ou a recusa */}
          <p className={`h-[16px] shrink-0 truncate text-[11px] leading-[16px] ${recusaDaPrevia ? 'text-destructive' : 'font-medium text-foreground'}`}
            data-testid="recriar-previa" title={recusaDaPrevia ?? previa?.descricao}>
            {recusaDaPrevia ?? previa?.descricao ?? 'Calculando…'}
          </p>
          <p className="h-[16px] shrink-0 whitespace-nowrap text-[10px] leading-[16px] tabular-nums text-muted-foreground" data-testid="recriar-dados">
            {!recusaDaPrevia && dados ? `venc. ${dados.vencimento} · ${dados.valor} · programado` : ''}
          </p>
          <p className="h-[16px] shrink-0 truncate text-[10px] leading-[16px] text-muted-foreground" data-testid="recriar-molde"
            title={!recusaDaPrevia && previa ? fraseDoMolde(previa) : undefined}>
            {!recusaDaPrevia && previa ? fraseDoMolde(previa) : ''}
          </p>
        </div>
        <AlertDialogFooter className={RODAPE}>
          <span className="mr-auto min-w-0 truncate text-[10px] font-medium text-destructive" data-testid="recriar-recado" title={recusa ?? undefined}>{recusa ?? ''}</span>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={aoVoltar} title="Fecha sem gravar nada">Voltar</Button>
          <Button type="button" size="sm" className="gap-1.5" disabled={ocupado || !!porQueNao} title={porQueNao ?? undefined}
            onClick={() => { void gravar(); }} data-testid="recriar-gravar">
            {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Recriar lançamento
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

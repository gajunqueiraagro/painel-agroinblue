/**
 * "VOLTAR PARA À VISTA" — P74b. O botão e a confirmação antes → depois (AlertDialog, nunca `confirm()`): antes, as N parcelas; depois, UM
 * lançamento à vista (a soma, o vencimento original) e as N−1 canceladas; o total igual. Mora em dois lugares: o rodapé do Editar obrigação
 * (cadastro do parcelamento) e o bloco "Parcelamento" da aba Pagamento do lançamento que é parcela.
 * ⚠ A prévia é a PRÓPRIA função do banco, simulada: se ela recusa (parcela paga/conciliada), o botão fica APAGADO com a frase dela (no
 *   `title` e, com `comFrase`, embaixo); se não é compra parcelada, o botão não se oferece.
 * ⚠ P96a — a compra que veio da JUNÇÃO de lançamentos soltos não tem à vista: no lugar (o mesmo botão, a mesma altura) fica
 *   "Desfazer a junção" (`fn_parcelamento_desfazer_juncao`): os N voltam a ser soltos, nenhum é cancelado.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BLOCO_FORMULARIO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { brCentavos } from '@/lib/financiamentos/parcelasLivres';
import {
  desfazerJuncao, simularDesfazerJuncao, simularVoltaAVista, voltarParaAVista, type DesfazerJuncao, type GravadoresDaVolta, type VoltaAVista,
} from '@/lib/financeiro/voltarAVista';
import { cn } from '@/lib/utils';

const dataBR = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function VoltarParaAVista({ clienteId, financiamentoId, onVoltou, comFrase = false, emBloco = false, className, botaoClassName, gravadores }: {
  clienteId: string; financiamentoId: string; onVoltou: () => void; comFrase?: boolean;
  /** a aba Pagamento: o botão num bloco "Parcelamento · compra parcelada em N" (que só aparece quando a compra é um parcelamento) */
  emBloco?: boolean; className?: string; /** a altura do botão no rodapé do hospedeiro */ botaoClassName?: string; gravadores?: GravadoresDaVolta;
}) {
  const [previa, setPrevia] = useState<VoltaAVista | null | 'lendo'>('lendo');
  const [confirmar, setConfirmar] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [desfazer, setDesfazer] = useState<DesfazerJuncao | null | 'lendo'>(null);

  useEffect(() => {
    let vivo = true;
    setPrevia('lendo');
    void simularVoltaAVista(financiamentoId, gravadores).then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [financiamentoId, gravadores]);

  const juncao = previa !== null && previa !== 'lendo' && previa.ok === false && previa.motivo === 'juncao';
  useEffect(() => {
    if (!juncao) { setDesfazer(null); return; }
    let vivo = true;
    setDesfazer('lendo');
    void simularDesfazerJuncao(financiamentoId, gravadores).then((r) => { if (vivo) setDesfazer(r); });
    return () => { vivo = false; };
  }, [juncao, financiamentoId, gravadores]);

  if (previa === null) return null;
  const lendo = previa === 'lendo';
  const recusa = !lendo && previa.ok === false ? previa.frase : null;
  const pronta = !lendo && previa.ok === true ? previa : null;
  const n = !lendo ? previa.antes.length : 0;
  const totalCent = !lendo ? previa.antes.reduce((s, x) => s + x.valorCent, 0) : 0;

  const gravar = async () => {
    setGravando(true); setErro(null);
    try {
      const r = await voltarParaAVista(clienteId, financiamentoId, gravadores);
      if (r.ok === false) { setErro(r.erro); setConfirmar(false); return; }
      toast.success('A compra voltou para à vista');
      setConfirmar(false);
      onVoltou();
    } finally { setGravando(false); }
  };

  const gravarDesfazer = async () => {
    setGravando(true); setErro(null);
    try {
      const r = await desfazerJuncao(clienteId, financiamentoId, gravadores);
      if (r.ok === false) { setErro(r.erro); setConfirmar(false); return; }
      toast.success('A junção foi desfeita: os lançamentos voltaram a ser soltos');
      setConfirmar(false);
      onVoltou();
    } finally { setGravando(false); }
  };
  const desfazerPronto = desfazer && desfazer !== 'lendo' && desfazer.ok ? desfazer : null;
  const recusaDoDesfazer = desfazer && desfazer !== 'lendo' && desfazer.ok === false ? desfazer.frase : null;

  const conteudoDaJuncao = (
    <div className={cn('flex min-w-0 flex-col gap-0.5', emBloco && 'items-start', className)} data-testid="desfazer-juncao">
      <Button type="button" size="sm" variant="outline" className={cn('h-[24px] shrink-0 px-2.5 text-[10.5px]', botaoClassName)} disabled={!desfazerPronto}
        title={recusaDoDesfazer ?? (desfazerPronto ? `Os ${desfazerPronto.lancamentos} lançamentos voltam a ser soltos (nenhum é cancelado).` : 'Conferindo a junção…')}
        onClick={() => setConfirmar(true)} data-testid="desfazer-juncao-botao">Desfazer a junção</Button>
      {comFrase && (recusaDoDesfazer || erro) && <p className="text-[10px] text-muted-foreground" data-testid="desfazer-juncao-frase">{erro ?? recusaDoDesfazer}</p>}
      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!o && !gravando) setConfirmar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer a junção?</AlertDialogTitle>
            <AlertDialogDescription data-testid="desfazer-juncao-texto">
              {desfazerPronto ? `Os ${desfazerPronto.lancamentos} lançamentos voltam a ser soltos, sem parcelamento. Nenhum é cancelado; valor, vencimento, pagamento e conciliação não mudam.${desfazerPronto.competenciaVolta ? ` A competência volta à de antes em ${desfazerPronto.competenciaVolta}.` : ''}${desfazerPronto.competenciaMantida ? ` ${desfazerPronto.competenciaMantida} ${desfazerPronto.competenciaMantida === 1 ? 'teve a competência mexida depois e fica como está' : 'tiveram a competência mexida depois e ficam como estão'}.` : ''}` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gravando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={gravando || !desfazerPronto} data-testid="desfazer-juncao-gravar" onClick={(e) => { e.preventDefault(); void gravarDesfazer(); }}>
              {gravando ? 'Desfazendo…' : 'Desfazer a junção'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const conteudo = juncao ? conteudoDaJuncao : (
    <div className={cn('flex min-w-0 flex-col gap-0.5', emBloco && 'items-start', className)} data-testid="voltar-a-vista">
      <Button type="button" size="sm" variant="outline" className={cn('h-[24px] shrink-0 px-2.5 text-[10.5px]', botaoClassName)} disabled={lendo || !!recusa}
        title={recusa ?? (lendo ? 'Conferindo as parcelas…' : `As ${n} parcelas voltam a ser um lançamento à vista.`)}
        onClick={() => setConfirmar(true)} data-testid="voltar-a-vista-botao">Voltar para à vista</Button>
      {comFrase && (recusa || erro) && <p className="text-[10px] text-muted-foreground" data-testid="voltar-a-vista-frase">{erro ?? recusa}</p>}

      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!o && !gravando) setConfirmar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar a compra para à vista?</AlertDialogTitle>
            <AlertDialogDescription>{pronta?.descricao ?? ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <table className="w-full table-fixed border-collapse text-[10.5px]" data-testid="voltar-a-vista-antes-depois">
            <colgroup><col style={{ width: 62 }} /><col /><col style={{ width: 92 }} /><col style={{ width: 100 }} /></colgroup>
            <thead className="bg-primary text-primary-foreground"><tr><th className="h-[19px] px-1.5 text-left font-medium" /><th className="px-1.5 text-left font-medium">Parcela</th>
              <th className="px-1.5 text-left font-medium">Vencimento</th><th className="px-1.5 text-right font-medium">Valor</th></tr></thead>
            <tbody>
              {!lendo && previa.antes.map((x, i) => (
                <tr key={x.numero} className="border-b" data-testid="voltar-a-vista-antes">
                  <td className="px-1.5 text-muted-foreground">{i === 0 ? 'Antes' : ''}</td>
                  <td className="px-1.5 tabular-nums">{x.numero}/{n}</td>
                  <td className="px-1.5 tabular-nums">{dataBR(x.vencimento)}</td>
                  <td className="px-1.5 text-right tabular-nums text-destructive">−{brCentavos(x.valorCent)}</td>
                </tr>
              ))}
              {pronta && (<>
                <tr className="border-b" data-testid="voltar-a-vista-depois">
                  <td className="px-1.5 font-semibold">Depois</td><td className="px-1.5">à vista (este)</td>
                  <td className="px-1.5 tabular-nums">{dataBR(pronta.vencimento)}</td>
                  <td className="px-1.5 text-right tabular-nums text-destructive">−{brCentavos(pronta.valorCent)}</td>
                </tr>
                <tr className="border-b text-muted-foreground" data-testid="voltar-a-vista-canceladas">
                  <td className="px-1.5" /><td className="px-1.5" colSpan={2}>{pronta.canceladas === 1 ? 'a outra parcela fica cancelada' : `as outras ${pronta.canceladas} ficam canceladas`}</td>
                  <td className="px-1.5 text-right">—</td>
                </tr>
              </>)}
              <tr className="bg-muted/60 font-semibold"><td className="px-1.5">Total</td><td className="px-1.5">{pronta && pronta.valorCent === totalCent ? 'igual ao antes' : ''}</td><td className="px-1.5" />
                <td className="px-1.5 text-right tabular-nums text-destructive">−{brCentavos(totalCent)}</td></tr>
            </tbody>
          </table>
          <p className="text-[10.5px] text-muted-foreground">Os documentos e a classificação ficam no lançamento. As canceladas ficam com o motivo "voltou para à vista" (nada é apagado).</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gravando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={gravando || !pronta} data-testid="voltar-a-vista-gravar" onClick={(e) => { e.preventDefault(); void gravar(); }}>
              {gravando ? 'Voltando…' : 'Voltar para à vista'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  return emBloco ? (
    <section className={cn(BLOCO_FORMULARIO, 'gap-1')} data-testid="voltar-a-vista-bloco">
      <TituloDoBloco nome="Parcelamento" dica={lendo ? 'compra parcelada'
        : juncao ? (desfazerPronto ? `juntada de ${desfazerPronto.lancamentos} lançamentos soltos` : 'compra juntada de lançamentos soltos') : `compra parcelada em ${n}`} />
      {conteudo}
    </section>
  ) : conteudo;
}

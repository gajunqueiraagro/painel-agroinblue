import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { OpcoesDeEscopo, type EscopoDePropagacao } from '@/components/financeiro-v2/OpcoesDeEscopo';
import {
  OPCOES_DO_CONTRATO, ROTULO_DO_CAMPO, fraseDoNomeProprio, lancamentosDoEscopo, type PreviaDaPropagacao,
} from '@/lib/financiamentos/propagarContrato';

/**
 * ATÉ ONDE A EDIÇÃO DO CONTRATO ALCANÇA AS PARCELAS — PARC-CONTRATO-01 item 2 (Gabriel, 05 e 07/10/2026).
 *
 * As três opções são a MESMA peça da recorrência (`OpcoesDeEscopo`). A diferença de fluxo é de propósito:
 * ⚠ AQUI NADA FOI GRAVADO AINDA. Na recorrência a regra já está salva quando o diálogo abre; no contrato a gravação é UMA
 *   (contrato + lançamentos, na mesma transação) e só acontece no "Salvar". Por isso o botão da esquerda é "Voltar": fecha
 *   sem gravar nada e devolve ao Editar obrigação. Depois de salvo, a volta é editar de novo.
 * ⚠ OS NÚMEROS SÃO OS DO BANCO: a tabela é a prévia de `fn_parcelamento_propagar` (a mesma função que grava). Trocar a opção
 *   só troca qual coluna vale; nada é recalculado aqui.
 * A recusa do banco fica ESCRITA ao lado do botão — nunca em toast.
 */
interface Props {
  descricao: string;
  previa: PreviaDaPropagacao;
  /** grava com o escopo escolhido; devolve a frase da recusa, ou nulo quando gravou */
  aoSalvar: (escopo: EscopoDePropagacao) => Promise<string | null>;
  aoVoltar: () => void;
}

const TH = 'h-[18px] bg-primary px-1.5 py-0 text-left text-[9.5px] font-semibold text-primary-foreground';
const TD = 'h-[18px] px-1.5 py-0 text-[10px] leading-[17px]';

export function PropagarContratoDialog({ descricao, previa, aoSalvar, aoVoltar }: Props) {
  const [escopo, setEscopo] = useState<EscopoDePropagacao>('futuros');
  const [ocupado, setOcupado] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  const nomeProprio = fraseDoNomeProprio(previa, escopo);
  const n = lancamentosDoEscopo(previa, escopo);

  const salvar = async () => {
    setOcupado(true); setRecusa(null);
    try {
      const erro = await aoSalvar(escopo);
      if (erro) setRecusa(erro);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o && !ocupado) aoVoltar(); }}>
      <DialogContent className="w-[94vw] max-w-[620px] gap-0 overflow-hidden p-0" data-testid="propagar-contrato">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">Levar a alteração às parcelas</DialogTitle>
          <DialogDescription className="mt-1 truncate text-[11px] leading-snug" title={descricao}>
            {descricao} · nada foi gravado ainda
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 px-4 py-3">
          {/* o que muda, em tabela: uma linha por campo; os números são os da prévia do banco */}
          <table className="w-full table-fixed border-collapse" data-testid="propagar-campos">
            <colgroup>
              <col style={{ width: 112 }} /><col /><col style={{ width: 66 }} /><col style={{ width: 54 }} />
            </colgroup>
            <thead>
              <tr>
                <th className={TH}>Campo</th>
                <th className={TH}>De → para</th>
                <th className={`${TH} text-right`}>Não pagas</th>
                <th className={`${TH} text-right`}>Pagas</th>
              </tr>
            </thead>
            <tbody>
              {previa.campos.map(c => {
                const dePara = `${c.de ?? '—'} → ${c.para ?? '—'}`;
                /* a paga só muda em "Futuros e passados", e só nos campos que o banco marca (`nasPagas`): fora disso, apagado com o motivo */
                const pagaVale = escopo === 'todos' && c.nasPagas;
                const naoPagaVale = escopo !== 'nenhum';
                return (
                  <tr key={c.campo} className="border-b" data-testid={`propagar-campo-${c.campo}`}>
                    <td className={`${TD} whitespace-nowrap font-medium`}>{ROTULO_DO_CAMPO[c.campo]}</td>
                    <td className={`${TD} truncate`} title={dePara}>
                      <span className="text-muted-foreground">{c.de ?? '—'}</span> → <span className="font-medium">{c.para ?? '—'}</span>
                    </td>
                    <td className={`${TD} text-right tabular-nums ${naoPagaVale ? 'font-semibold' : 'text-muted-foreground/60'}`}>{c.naoPagas}</td>
                    <td className={`${TD} text-right tabular-nums ${pagaVale ? 'font-semibold' : 'text-muted-foreground/60'}`}
                      title={c.nasPagas ? (escopo === 'todos' ? undefined : 'só em "Futuros e passados"') : 'este campo não muda em parcela paga'}>
                      {c.nasPagas ? c.pagas : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${TD} bg-[#E8E6DF] font-bold`} colSpan={2}>Parcelas do contrato</td>
                <td className={`${TD} bg-[#E8E6DF] text-right font-bold tabular-nums`} data-testid="propagar-nao-pagas">{previa.parcelas.naoPagas}</td>
                <td className={`${TD} bg-[#E8E6DF] text-right font-bold tabular-nums`} data-testid="propagar-pagas">{previa.parcelas.pagas}</td>
              </tr>
            </tfoot>
          </table>

          {/* lugar FIXO de 14px: o nome posto à mão não é sobrescrito, e a tela diz quantos são */}
          <p className="h-[14px] truncate text-[10px] leading-[14px] text-amber-700" data-testid="propagar-nome-proprio" title={nomeProprio ?? undefined}>
            {nomeProprio ?? ''}
          </p>

          <OpcoesDeEscopo opcoes={OPCOES_DO_CONTRATO} valor={escopo} aoMudar={setEscopo} prefixo="prop-contrato" />
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-end">
          <span className={`mr-auto min-w-0 truncate text-[10px] ${recusa ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
            data-testid="propagar-recado" title={recusa ?? undefined}>
            {recusa ?? (escopo === 'nenhum'
              ? 'Só o contrato será gravado.'
              : `${n === 1 ? '1 lançamento será alterado' : `${n} lançamentos serão alterados`}, junto com o contrato.`)}
          </span>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={aoVoltar} title="Fecha sem gravar nada">Voltar</Button>
          <Button type="button" size="sm" className="gap-1.5" disabled={ocupado} onClick={() => { void salvar(); }}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

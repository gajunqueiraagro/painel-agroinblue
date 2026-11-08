/**
 * OC-BUSCAR-RECEBIMENTO-01 (adendo, Gabriel 07/11 08:34) — O LANÇAMENTO DA OC AINDA NÃO SALVO JÁ MOSTRA OS DOCUMENTOS DA OPERAÇÃO.
 * O "Programar recebimento" abria a aba Documentos com "Salve o lançamento para anexar": a NF, o romaneio e o acerto da OC já existem e
 * valem para o recebimento (como no lançamento já salvo, onde vêm com o selo "da operação"). Só leitura, pela MESMA leitura da aba da OC
 * (`useOperacaoDocumentos`); anexar outro continua depois de salvar.
 */
import { useOperacaoDocumentos } from '@/hooks/useOperacaoDocumentos';
import { PREFIXO_ESPECIE } from '@/lib/oc/prefixoDaEspecie';
import { formatMoeda } from '@/lib/calculos/formatters';
import { QUADRO_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';

const dataBr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function DocumentosDaOperacaoAntesDeSalvar({ operacaoId, clienteId }: { operacaoId: string; clienteId: string | null }) {
  const api = useOperacaoDocumentos({ operacaoId, clienteId, enabled: !!clienteId });
  const ativos = api.documentos.filter((d) => !d.cancelado);
  return (
    <div className="space-y-1" data-testid="documentos-da-operacao-antes">
      <p className="text-[10px] text-muted-foreground">
        {api.loading ? 'Lendo os documentos da operação…'
          : ativos.length === 0 ? 'A operação não tem documento. Salve o lançamento para anexar.'
            : 'Valem para este lançamento. Para anexar outro, salve.'}
      </p>
      {ativos.length > 0 && (
        <div className={cn(QUADRO_REGUA, 'h-auto')}>
          <table className="w-full table-fixed border-collapse">
            <colgroup><col /><col style={{ width: 76 }} /><col style={{ width: 96 }} /><col style={{ width: 82 }} /></colgroup>
            <thead className="bg-primary">
              <tr>
                <th className={cn(TH_REGUA, 'pl-[10px] text-left')}>Documento</th>
                <th className={cn(TH_REGUA, 'text-left')}>Emissão</th>
                <th className={cn(TH_REGUA, 'text-right')}>Valor</th>
                <th className={TH_REGUA} />
              </tr>
            </thead>
            <tbody>
              {ativos.map((d) => {
                const nome = `${PREFIXO_ESPECIE[d.especie]}${d.numero ? ` ${d.numero}` : ''}${d.serie ? ` · série ${d.serie}` : ''}`;
                return (
                  <tr key={d.documentoId} className="h-[19px] border-t" data-testid="documento-da-operacao">
                    <td className={cn(TD_REGUA_TEXTO, 'pl-[10px] font-semibold')} title={nome}>{nome}</td>
                    <td className={cn(TD_REGUA, 'whitespace-nowrap tabular-nums text-muted-foreground')}>{dataBr(d.dataEmissao)}</td>
                    <td className={TD_REGUA_NUM}>{formatMoeda(d.valorLiquido)}</td>
                    <td className={cn(TD_REGUA, 'pr-[10px] text-right')}>
                      <span className="rounded-full bg-blue-100 px-1.5 text-[9.5px] leading-[13px] text-blue-700">da operação</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

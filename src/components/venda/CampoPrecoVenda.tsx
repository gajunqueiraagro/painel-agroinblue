/**
 * CampoPrecoVenda — a base de preço da venda e o valor, num controle só.
 *
 * ⚠ EXTRAIDO, NAO ESCRITO. O markup abaixo veio de `VendaFinanceiroPanel`, movido byte a
 * byte em PR-ZOO-VENDA-META-01, quando a venda em META passou a precisar dos mesmos dois
 * controles dentro do envelope. Escrever uma segunda versão seria a terceira do mesmo
 * controle no sistema — e a terceira cópia é como a sexta começa (ver `brl`, que chegou a
 * seis versões divergentes antes de virar `CampoMoeda`).
 *
 * ⚠ AS ALTURAS SAO PROP COM DEFAULT IGUAL AO DE HOJE. `VendaFinanceiroPanel` não passa
 * nada e continua idêntico; o shell de meta passa a tipografia do envelope. A extração
 * não muda o que já existia — só permite que outro host use o mesmo controle.
 *
 * ⚠ O QUE NAO VEIO JUNTO, e é do host: o colapsável, o `summaryBadge` e o bloco de dicas
 * derivadas (R$/kg, R$/cab, Total base). São irmãos deste markup, não filhos — ficaram
 * onde estavam.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BasePrecoVenda } from '@/types/cattle';

export interface CampoPrecoVendaProps {
  vendaTipoPreco: BasePrecoVenda;
  onVendaTipoPrecoChange: (v: BasePrecoVenda) => void;
  vendaPrecoInput: string;
  onVendaPrecoInputChange: (v: string) => void;
  /** Altura dos botões de base. Default = o que o VendaFinanceiroPanel sempre teve. */
  alturaBotao?: string;
  /** Classe do campo de valor. Default = o que o VendaFinanceiroPanel sempre teve. */
  classeCampo?: string;
  /** Classe do rótulo. Default = o que o VendaFinanceiroPanel sempre teve. */
  classeRotulo?: string;
}

export function CampoPrecoVenda({
  vendaTipoPreco, onVendaTipoPrecoChange, vendaPrecoInput, onVendaPrecoInputChange,
  alturaBotao = 'h-8', classeCampo = 'h-7 text-[11px]', classeRotulo = 'text-[11px]',
}: CampoPrecoVendaProps) {
  return (
    <>
              <div className="grid grid-cols-3 gap-1.5">
                {(['por_kg', 'por_cab', 'por_total'] as const).map(tp => (
                  <button key={tp} type="button"
                    onClick={() => onVendaTipoPrecoChange(tp)}
                    className={`${alturaBotao} rounded text-[11px] font-bold border-2 transition-all ${vendaTipoPreco === tp ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                    {tp === 'por_kg' ? 'Por kg' : tp === 'por_cab' ? 'R$/cabeça' : 'Por total'}
                  </button>
                ))}
              </div>
              <div>
                <Label className={classeRotulo}>
                  {vendaTipoPreco === 'por_kg' ? 'R$/kg' : vendaTipoPreco === 'por_cab' ? 'R$/cabeça' : 'Valor total (R$)'}
                </Label>
                <Input
                  type="number"
                  value={vendaPrecoInput}
                  onChange={e => onVendaPrecoInputChange(e.target.value)}
                  placeholder="0,00"
                  className={classeCampo}
                />
              </div>
    </>
  );
}

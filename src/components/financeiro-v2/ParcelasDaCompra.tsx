/**
 * "Parcelas" do Novo lançamento parcelado — tela A do mock `docs/mocks/fin_nfe_parcelas_pr2_mock_v2.html`
 * (FIN-NFE-PARCELAS-01 PR 2b).
 *
 * Uma linha por parcela com a NF da compra (a mesma nas N) e o boleto DAQUELA parcela, "+ Boleto" na
 * linha ou "Anexar vários boletos". Tudo em memória até o salvar.
 *
 * ⚠ VENCIMENTO E VALOR SÃO A PRÉVIA QUE O DIÁLOGO JÁ MOSTRAVA (`preverParcelas`, o espelho da
 *   `fn_parcelamento_cadastrar`), recebidos prontos. Esta tela não calcula parcela nenhuma.
 * ⚠ BOLETO É OPCIONAL: parcela sem boleto não é pendência.
 * ⚠ A31: larguras fixas (nada muda de largura quando o dado muda), cabeçalho e rodapé fixos.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import { motivoArquivoRecusado, type DocumentoPendente } from '@/lib/financeiro/documentosPendentes';
import { NomeDoArquivo } from '@/components/financeiro-v2/NomeDoArquivo';

export interface ParcelaPrevistaLinha { numero: number; dataVencimento: string; valor: number }

const TH = 'sticky top-0 z-10 h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white';
/* `leading-none`: o botão "+ Boleto" e o X não podem esticar a linha além dos 18px (medido: 21 sem isto). */
const TD = 'h-[18px] border-b border-[#eceae4] px-[4px] py-0 text-[10px] leading-none align-middle';
const TF = 'sticky bottom-0 z-10 h-[19px] border-t-2 border-[#9aa7b6] bg-[#E8E6DF] px-[4px] text-[10px] font-bold';
const DV = 'border-l-2 border-l-[#9aa7b6]';
const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
};
const valorBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ParcelasDaCompra({ parcelas, notaFiscal, qtdNotas, boletos, onBoleto, onTirarBoleto, onAnexarVarios, travado, foraDoPlano }: {
  parcelas: readonly ParcelaPrevistaLinha[];
  /** Número da NF da compra pendente (a primeira), ou null. */
  notaFiscal: string | null;
  qtdNotas: number;
  /** Boletos pendentes, um por parcela. */
  boletos: readonly DocumentoPendente[];
  onBoleto: (parcela: number, arquivo: File) => void;
  onTirarBoleto: (chave: string) => void;
  onAnexarVarios: () => void;
  travado?: boolean;
  /** Boletos de parcela que não existe mais no plano (o operador baixou o número de parcelas). */
  foraDoPlano: readonly DocumentoPendente[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [recusa, setRecusa] = useState<{ parcela: number; msg: string } | null>(null);

  const porParcela = new Map(boletos.map(b => [b.parcela, b]));
  const total = parcelas.reduce((acc, p) => acc + p.valor, 0);
  const comBoleto = parcelas.filter(p => porParcela.has(p.numero)).length;
  const nf = notaFiscal ? (formatNFNumber(notaFiscal) || notaFiscal) : null;
  const n = parcelas.length;

  const escolher = (parcela: number) => { setAlvo(parcela); setRecusa(null); inputRef.current?.click(); };

  return (
    <div className="space-y-1.5" data-testid="parcelas-da-compra">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground">
          Parcelas <span className="font-normal text-muted-foreground">· 1 boleto por parcela · agora ou depois</span>
        </span>
        <Button type="button" variant="outline" className="h-[22px] px-[9px] text-[10px]" disabled={travado} onClick={onAnexarVarios}
          data-testid="abrir-anexar-varios">
          Anexar vários boletos
        </Button>
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" data-testid="input-boleto-linha"
        onChange={e => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (!f || alvo == null) return;
          const msg = motivoArquivoRecusado(f);
          if (msg) { setRecusa({ parcela: alvo, msg }); return; }
          onBoleto(alvo, f);
        }} />
      <div className="max-h-[260px] overflow-auto rounded border border-[#E0E2E6]">
        <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
          <colgroup>
            <col style={{ width: 64 }} /><col style={{ width: 82 }} /><col style={{ width: 100 }} />
            <col style={{ width: 96 }} /><col /><col style={{ width: 78 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Parcela</th>
              <th className={TH}>Vencimento</th>
              <th className={TH}>Valor R$</th>
              <th className={`${TH} ${DV}`}>Nota fiscal</th>
              <th className={TH}>Boleto</th>
              <th className={TH}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p, k) => {
              const b = porParcela.get(p.numero);
              const rec = recusa?.parcela === p.numero ? recusa.msg : null;
              return (
                <tr key={p.numero} className={k % 2 ? 'bg-[#FAFAF8]' : 'bg-white'} data-testid="linha-parcela">
                  <td className={`${TD} text-center`}>{p.numero}/{n}</td>
                  <td className={`${TD} text-center`}>{dataCurta(p.dataVencimento)}</td>
                  <td className={`${TD} text-right`}>{valorBR(p.valor)}</td>
                  <td className={`${TD} ${DV} text-center`}>{nf ?? '—'}</td>
                  {/* PR 2b-fix2 — uma linha só: a célula de nome de arquivo do fix1 (fim fixo, começo encolhe), inteiro no `title`. */}
                  <td className={`${TD} overflow-hidden whitespace-nowrap`} title={b?.arquivo?.name} data-testid="boleto-da-parcela">
                    {rec ? <span className="text-destructive">{rec}</span>
                      : b?.arquivo ? <NomeDoArquivo nome={b.arquivo.name} />
                        : <span className="text-muted-foreground">sem boleto</span>}
                  </td>
                  <td className={`${TD} text-center whitespace-nowrap`}>
                    {travado ? null : b ? (
                      <button type="button" aria-label={`Tirar boleto da parcela ${p.numero}`} title="Tirar boleto"
                        onClick={() => onTirarBoleto(b.chave)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => escolher(p.numero)} data-testid={`mais-boleto-${p.numero}`}
                        className="inline-flex items-center gap-0.5 text-primary hover:underline">
                        <Plus className="h-3 w-3" /> Boleto
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={`${TF} text-center`}>Total</td>
              <td className={`${TF} text-center whitespace-nowrap`}>{n} parcelas</td>
              <td className={`${TF} text-right`}>{valorBR(total)}</td>
              <td className={`${TF} ${DV} text-center`}>{qtdNotas === 0 ? 'sem nota' : `${qtdNotas} ${qtdNotas === 1 ? 'nota' : 'notas'}`}</td>
              <td className={TF} data-testid="com-boleto">{comBoleto} de {n} com boleto</td>
              <td className={TF} />
            </tr>
          </tfoot>
        </table>
      </div>
      {foraDoPlano.length > 0 && (
        <p className="text-[10px] text-destructive" data-testid="boleto-fora-do-plano">
          Boleto de parcela que não existe mais no plano de {n}: {foraDoPlano.map(b => `parcela ${b.parcela}`).join(', ')} — tire-o
          {!travado && foraDoPlano.map(b => (
            <button key={b.chave} type="button" className="ml-1 underline" onClick={() => onTirarBoleto(b.chave)}>tirar {b.parcela}</button>
          ))}
          {' '}ou volte o número de parcelas.
        </p>
      )}
    </div>
  );
}

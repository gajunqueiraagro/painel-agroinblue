/**
 * VENDER DO ESTOQUE — a saída de grão fora do barter (PR-ESTOQUE-GRAOS-F3).
 *
 * ⚠ O ESTOQUE NÃO TEM BAIXA A ESCREVER. `fn_estoque_graos` calcula `colhido − entregue`, e a
 * venda avulsa É uma operação comercial com entregas — então o saldo cai sozinho quando a RPC
 * grava. Não há tabela de movimento, não há o que conciliar, e é por isso que este modal só
 * precisa registrar a venda: um segundo número de saldo é o que ele existe para não criar.
 *
 * ⚠ A VALIDAÇÃO DO SALDO É DA TELA, NÃO DO BANCO — e isso precisa ficar dito. Não há constraint
 * impedindo vender mais do que se tem; a RPC grava o que receber. O bloqueio aqui é a única
 * defesa, e por isso ele trava o botão, não só pinta o campo de vermelho.
 */
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, CampoNumero } from '@/components/ui/campo-moeda';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { Save, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import type { EstoqueClasse } from '@/hooks/useEstoqueGraos';

/** O que o modal devolve para quem chama a RPC. */
export interface VendaAvulsaPayload {
  comprador_id: string;
  data: string;
  condicao: 'avista' | 'aprazo';
  conta_id: string | null;
  vencimento: string | null;
  itens: Array<{ classe: string; sacas: number; preco: number }>;
}

const TH = 'bg-[#3a4864] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white';

export function VendaAvulsaModal({
  aberto, onFechar, onRegistrar, salvando, estoque, cultura, safraRotulo,
  fornecedores, contas,
}: {
  aberto: boolean;
  onFechar: () => void;
  onRegistrar: (p: VendaAvulsaPayload) => void;
  salvando: boolean;
  /** As classes com o saldo atual — a mesma lista que a tela mostra atrás. */
  estoque: readonly EstoqueClasse[];
  cultura: string;
  safraRotulo: string;
  fornecedores: ReadonlyArray<{ id: string; nome: string }>;
  contas: ReadonlyArray<{ id: string; nome_exibicao?: string | null; nome_conta?: string | null }>;
}) {
  const [compradorId, setCompradorId] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [condicao, setCondicao] = useState<'avista' | 'aprazo'>('avista');
  const [contaId, setContaId] = useState('');
  const [vencimento, setVencimento] = useState('');
  /**
   * `classe -> { sacas, preco }`.
   *
   * ⚠ OS DOIS TIPOS SÃO DIFERENTES PORQUE OS CAMPOS DA CASA SÃO: `CampoNumero` guarda TEXTO em
   * pt-BR (é ele que preserva "1.234,5" enquanto se digita) e `CampoMoeda` guarda NÚMERO. Unificar
   * aqui obrigaria a converter num dos dois sentidos a cada tecla, e é assim que "1.234" vira
   * 1,234 — o defeito que o `parseNumericValue` existe para evitar.
   */
  const [itens, setItens] = useState<Record<string, { sacas: string; preco: number | null }>>({});

  /**
   * ⚠ O PREÇO NASCE PREENCHIDO COM O DE REFERÊNCIA, e o operador pode mudar: ele é a média do que
   * já se entregou daquela classe, então é o palpite mais honesto que a tela tem. Nascer vazio
   * faria o operador digitar de novo um número que o sistema já sabe.
   * ⚠ E RECOMEÇA A CADA ABERTURA: sem isto, reabrir o modal traria as sacas da venda anterior,
   * que é a forma mais silenciosa de vender duas vezes o mesmo grão.
   */
  useEffect(() => {
    if (!aberto) return;
    const inicial: Record<string, { sacas: string; preco: number | null }> = {};
    for (const c of estoque) {
      inicial[c.classe] = { sacas: '', preco: c.preco_ref > 0 ? c.preco_ref : null };
    }
    setItens(inicial);
    setCompradorId(''); setCondicao('avista'); setContaId(''); setVencimento('');
    setData(new Date().toISOString().slice(0, 10));
  }, [aberto, estoque]);

  const linhas = useMemo(() => estoque.map(c => {
    const sacas = parseMoeda(itens[c.classe]?.sacas ?? '');
    const preco = itens[c.classe]?.preco ?? 0;
    return {
      ...c,
      sacas,
      preco,
      total: sacas * preco,
      /* ⚠ MEIO SACO DE TOLERÂNCIA, a mesma da RPC do estoque: o saldo já vem arredondado a duas
         casas, e barrar por 0,001 de diferença seria recusar uma venda legítima do lote inteiro. */
      excede: sacas > c.saldo + 0.005,
      /* Classe sem saldo não se vende — o campo nasce travado. */
      travada: c.saldo <= 0,
    };
  }), [estoque, itens]);

  const totais = useMemo(() => {
    const vendidas = linhas.reduce((a, l) => a + l.sacas, 0);
    return {
      vendidas,
      valor: linhas.reduce((a, l) => a + l.total, 0),
      saldoAtual: linhas.reduce((a, l) => a + l.saldo, 0),
      sobra: linhas.reduce((a, l) => a + (l.saldo - l.sacas), 0),
      excede: linhas.some(l => l.excede),
      vendidasComPreco: linhas.filter(l => l.sacas > 0 && l.preco > 0).length,
      semPreco: linhas.some(l => l.sacas > 0 && l.preco <= 0),
    };
  }, [linhas]);

  /**
   * ⚠ O MOTIVO DE O BOTÃO ESTAR DESLIGADO FICA ESCRITO AO LADO — regra da OC. Um botão cinza sem
   * explicação faz o operador procurar o defeito na tela em vez de no que ele preencheu.
   * ⚠ A ORDEM É A DO PREENCHIMENTO, não a da gravidade: quem está montando a venda quer saber o
   * PRÓXIMO passo, não o pior problema.
   */
  const impedimento = totais.vendidas <= 0 ? 'Informe quantas sacas vender.'
    : totais.excede ? 'Há classe acima do saldo em estoque.'
      : totais.semPreco ? 'Informe o preço das classes que está vendendo.'
        : !compradorId ? 'Escolha o comprador.'
          : !data ? 'Informe a data da venda.'
            : condicao === 'avista' && !contaId ? 'Escolha a conta que vai receber.'
              : condicao === 'aprazo' && !vencimento ? 'Informe o vencimento.'
                : null;

  const registrar = () => {
    if (impedimento) return;
    onRegistrar({
      comprador_id: compradorId,
      data,
      condicao,
      /* ⚠ A PRAZO A CONTA VAI SE HOUVER: ela é o destino futuro do dinheiro, e o lançamento
         programado já nasce apontando para onde vai cair. Vazia é aceitável. */
      conta_id: contaId || null,
      vencimento: condicao === 'aprazo' ? (vencimento || null) : null,
      /* ⚠ SÓ AS CLASSES COM SACAS: mandar `{sacas: 0}` criaria uma entrega de zero saca, que
         apareceria na composição da venda como uma linha que não existe. */
      itens: linhas.filter(l => l.sacas > 0)
        .map(l => ({ classe: l.classe, sacas: l.sacas, preco: l.preco })),
    });
  };

  const nomeDaConta = (c: { nome_exibicao?: string | null; nome_conta?: string | null }) =>
    c.nome_exibicao || c.nome_conta || '—';

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Vender do estoque · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              {formatNum(totais.saldoAtual, 2)} sc disponíveis — a saída baixa o estoque por
              construção, sem lançamento manual.
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 px-3 py-2">
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {['28%', '18%', '18%', '18%', '18%'].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Classe</th>
                  <th className={cn(TH, 'text-right')}>Em estoque</th>
                  <th className={cn(TH, 'text-right')}>Vender (sc)</th>
                  <th className={cn(TH, 'text-right')}>R$ / sc</th>
                  <th className={cn(TH, 'text-right')}>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  /* ⚠ A CLASSE SEM SALDO NÃO SOME, fica APAGADA: ela some do estoque mas não da
                     conversa — ver "Grão de roça 0,00" diz que já se entregou tudo, e uma linha
                     ausente faria o operador procurar onde ela foi parar. */
                  <tr key={l.classe}
                    className={cn('border-t border-slate-100', l.travada && 'opacity-45')}>
                    <td className="truncate px-2 py-1 text-[11px]">
                      <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                        corDaClasse(l.classe))} />
                      {labelDaClasse(l.classe)}
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums">
                      {formatNum(l.saldo, 2)}
                    </td>
                    <td className="px-1 py-1">
                      <CampoNumero valor={itens[l.classe]?.sacas ?? ''} disabled={l.travada}
                        onChange={v => setItens(o => ({
                          ...o, [l.classe]: { ...(o[l.classe] ?? { preco: null }), sacas: v },
                        }))}
                        className={cn('h-7 text-right text-[11px]',
                          l.excede && 'border-destructive focus-visible:ring-destructive')} />
                      {/* ⚠ O ERRO FICA NA LINHA, não num balão no rodapé: com três classes, um
                          aviso genérico obrigaria a conferir as três para achar qual estourou. */}
                      {l.excede && (
                        <div className="mt-0.5 flex items-center gap-1 text-[9px] text-destructive">
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                          acima do saldo ({formatNum(l.saldo, 2)} sc)
                        </div>
                      )}
                    </td>
                    <td className="px-1 py-1">
                      <CampoMoeda valor={itens[l.classe]?.preco ?? null} disabled={l.travada}
                        onChange={v => setItens(o => ({
                          ...o, [l.classe]: { ...(o[l.classe] ?? { sacas: '' }), preco: v },
                        }))}
                        className="h-7 text-right text-[11px]" />
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] font-medium tabular-nums">
                      {l.total > 0 ? formatMoeda(l.total) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label className="text-[10px]">Comprador <span className="text-destructive">*</span></Label>
              <Select value={compradorId} onValueChange={setCompradorId}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Data da venda <span className="text-destructive">*</span></Label>
              <DatePicker value={data} onChange={setData} size="compact" className="mt-0.5" />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label className="text-[10px]">Recebimento</Label>
              {/* ⚠ DOIS BOTÕES, NÃO UM `select`: são duas opções e a escolha muda os campos
                  abaixo — ver as duas lado a lado explica a diferença sem abrir nada. */}
              <div className="mt-0.5 inline-flex h-8 overflow-hidden rounded-md border">
                {(['avista', 'aprazo'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setCondicao(c)}
                    className={cn('px-3 text-[11px] font-medium transition-colors',
                      condicao === c ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                    {c === 'avista' ? 'À vista' : 'A prazo'}
                  </button>
                ))}
              </div>
            </div>
            {condicao === 'avista' ? (
              <div>
                <Label className="text-[10px]">
                  Conta que recebe <span className="text-destructive">*</span>
                </Label>
                <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-[12px]">
                        {nomeDaConta(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">
                    Vencimento <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker value={vencimento} onChange={setVencimento} size="compact"
                    className="mt-0.5" />
                </div>
                <div>
                  {/* ⚠ A CONTA CONTINUA A PRAZO, e é opcional: ela deixa de ser onde o dinheiro
                      CAIU e passa a ser onde ele VAI cair. O lançamento programado já nasce
                      apontando o destino, e quem não sabe ainda deixa vazio. */}
                  <Label className="text-[10px]">Conta de destino</Label>
                  <Select value={contaId} onValueChange={setContaId}>
                    <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map(c => (
                        <SelectItem key={c.id} value={c.id} className="text-[12px]">
                          {nomeDaConta(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ⚠ O RODAPÉ DIZ O EFEITO, não só o total: "vende X, sobra Y" é a frase que o operador
            confere antes de apertar — o total em dinheiro ele já viu na coluna. */}
        <div className="flex flex-wrap items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
          <span className="text-[11px]">
            Vende <strong className="tabular-nums">{formatNum(totais.vendidas, 2)}</strong> sc ·
            sobra <strong className="tabular-nums">{formatNum(totais.sobra, 2)}</strong> sc em estoque
          </span>
          <div className="flex-1" />
          <span className="text-[13px] font-bold tabular-nums">{formatMoeda(totais.valor)}</span>
          {impedimento && (
            <span className="w-full text-[10px] text-primary-foreground/80 md:w-auto">
              {impedimento}
            </span>
          )}
          <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
            disabled={!!impedimento || salvando} title={impedimento ?? 'Registrar a venda'}
            onClick={registrar}>
            <Save className="h-3.5 w-3.5" /> {salvando ? 'Registrando…' : 'Registrar venda'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * BAIXAR POR QUEBRA — a perda física do grão parado (PR-ESTOQUE-QUEBRA-01, F2).
 *
 * ⚠ ELE É O MODAL DE VENDA SEM DINHEIRO, e a semelhança é de propósito: mesma tabela de classes,
 * mesma anatomia de célula (rótulo em cima, controle `h-8` embaixo — a lição do a5b1fc58), mesmo
 * rodapé com "baixa X, sobra Y". Quem sabe registrar uma venda já sabe registrar uma quebra.
 * ⚠ E É POR ISSO QUE NÃO IMPORTA O OUTRO: copiar a estrutura mantém os dois livres para divergir
 * onde o assunto difere — aqui não há comprador, conta, preço nem lançamento —, enquanto importar
 * criaria um componente com dois modos e um `if` em cada linha.
 *
 * ⚠⚠ A GUARDA REAL NÃO ESTÁ AQUI, e esta é a diferença que mais importa contra o modal de venda.
 * Lá o bloqueio da tela é a única defesa; aqui `agri_quebra_registrar` lê `fn_estoque_graos` — a
 * MESMA fonte que esta tela lê — e recusa com `QUEBRA_ACIMA_DO_SALDO` antes de inserir. O que este
 * modal faz é conveniência: avisar antes, na linha, em vez de deixar o operador descobrir no erro.
 *
 * ⚠ NÃO HÁ MOTIVO "SECAGEM" — decisão do briefing, e ela tem raiz no dado: `agri_colheita` já grava
 * peso verde → seco. Uma quebra por secagem contaria a MESMA perda duas vezes.
 */
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LocalEstoqueSelect, useRegraLocalEstoque } from '@/components/agri/LocalEstoqueSelect';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoNumero } from '@/components/ui/campo-moeda';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { Save, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { rotuloCulturaUnidade, unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import type { EstoqueClasse } from '@/hooks/useEstoqueGraos';
import { TH_CINZA as TH, CINZA_CABECALHO } from '@/lib/idiomaVisual';

/** O que o modal devolve para quem chama a RPC — uma baixa por classe. */
export interface QuebraPayload {
  data: string;
  /** `null` = o banco resolve (cliente com um local só). */
  local_estoque_id: string | null;
  motivo: string;
  observacoes: string | null;
  itens: Array<{ classe: string; quantidade: number }>;
}

/**
 * ⚠ OS QUATRO MOTIVOS SÃO O `CHECK` DA TABELA, não uma lista de conveniência: o banco admite
 * exatamente `{umidade, praga, manuseio, outro}`, e um quinto valor aqui seria recusado no insert.
 * ⚠ O RÓTULO EXPLICA O VALOR porque "praga" sozinho não diz o que conta como praga — o operador
 * que perdeu saca para rato precisa reconhecer a opção sem perguntar.
 * ⚠ EXPORTADO porque o histórico (`MovimentacoesEstoqueModal`) precisa do MESMO mapa para ler
 * "praga" de volta como "Praga (roedor, inseto)". Duas listas seriam dois vocabulários para o
 * mesmo `CHECK` do banco — a lição do `Cartao` e do cinza do cabeçalho, pela terceira vez.
 * ⚠ E ELE MORA NUM COMPONENTE, o que não é o ideal: o lugar certo de um vocabulário de domínio é
 * um módulo folha em `lib/agri`. Fica assim enquanto houver DOIS consumidores e os dois forem
 * modais da mesma tela; no terceiro, move-se — e aí o import deixa de ser componente→componente.
 */
export const MOTIVOS = [
  { valor: 'umidade', rotulo: 'Umidade' },
  { valor: 'praga', rotulo: 'Praga (roedor, inseto)' },
  { valor: 'manuseio', rotulo: 'Manuseio e transporte interno' },
  { valor: 'outro', rotulo: 'Outro' },
] as const;

export function QuebraModal({
  aberto, onFechar, onRegistrar, salvando, estoque, cultura, safraRotulo, clienteId,
}: {
  aberto: boolean;
  onFechar: () => void;
  onRegistrar: (p: QuebraPayload) => void;
  salvando: boolean;
  /** As classes com o saldo atual — a MESMA lista que a tela mostra atrás, não uma segunda leitura. */
  estoque: readonly EstoqueClasse[];
  cultura: string;
  safraRotulo: string;
  clienteId: string | null | undefined;
}) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [localId, setLocalId] = useState('');
  const { precisaEscolher, ativos } = useRegraLocalEstoque(clienteId);
  /* ⚠ O AVISO É SÓ PARA LOCAL DE TERCEIRO (spec 8b): na cooperativa a perda de armazenagem chega
     pelo extrato de depósito, e lançar aqui o que o extrato vai trazer contaria a mesma saca duas
     vezes. Quebra por evento — um caminhão que virou, um lote molhado — continua valendo, e é
     isso que a frase autoriza. */
  const localEhTerceiro = ativos.find(l => l.id === localId)?.tipo === 'terceiro';
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  /** `classe -> quantidade digitada`, em TEXTO pt-BR — é o `CampoNumero` que preserva "1.234,5". */
  const [itens, setItens] = useState<Record<string, string>>({});

  /* ⚠ RECOMEÇA A CADA ABERTURA, como o modal de cotação: sem isto, reabrir traria as quantidades
     da vez anterior e bastaria um Registrar distraído para baixar o mesmo grão duas vezes. */
  useEffect(() => {
    if (!aberto) return;
    setItens({});
    setMotivo('');
    setObservacoes('');
    setData(new Date().toISOString().slice(0, 10));
  }, [aberto]);

  const unidade = unidadeCurtaDaCultura(cultura);

  const linhas = useMemo(() => estoque.map(c => {
    /* ⚠ `parseMoeda`, NUNCA `Number`: o campo guarda texto pt-BR, e `Number('1.234,5')` é NaN —
       a armadilha que já custou peso e quantidade noutras telas. */
    const qtd = parseMoeda(itens[c.classe] ?? '') ?? 0;
    return {
      classe: c.classe,
      saldo: c.saldo,
      qtd,
      /* ⚠ MEIO SACO DE TOLERÂNCIA, a mesma da RPC do estoque e a mesma do modal de venda: o saldo
         já vem arredondado a duas casas, e barrar por 0,001 recusaria a baixa do lote inteiro. */
      excede: qtd > c.saldo + 0.005,
      /* ⚠ TRAVADA EM ZERO PARA BAIXO — enquanto a linha excede ela já grita em vermelho, e um
         "−300" ao lado seria um segundo aviso, mais fraco, para o mesmo erro. */
      sobra: Math.max(c.saldo - qtd, 0),
      /* Classe sem saldo não se baixa — o campo nasce travado. */
      travada: c.saldo <= 0,
    };
  }), [estoque, itens]);

  const totais = useMemo(() => ({
    baixadas: linhas.reduce((a, l) => a + l.qtd, 0),
    saldoAtual: linhas.reduce((a, l) => a + l.saldo, 0),
    sobra: linhas.reduce((a, l) => a + l.sobra, 0),
    excede: linhas.some(l => l.excede),
  }), [linhas]);

  /**
   * ⚠ O MOTIVO DE O BOTÃO ESTAR DESLIGADO FICA ESCRITO AO LADO — regra da OC, a mesma do modal de
   * venda. A ordem é a do PREENCHIMENTO, não a da gravidade: quem está montando a baixa quer saber
   * o PRÓXIMO passo, não o pior problema.
   */
  const impedimento = precisaEscolher && !localId ? 'Escolha o local de estoque.'
    : totais.baixadas <= 0 ? `Informe quanto baixar (${unidade}).`
    : totais.excede ? 'Há classe acima do saldo em estoque.'
      : !data ? 'Informe a data da quebra.'
        : !motivo ? 'Escolha o motivo da quebra.'
          : null;

  const registrar = () => {
    if (impedimento) return;
    onRegistrar({
      data,
      /* ⚠ SÓ MANDA QUANDO HÁ ESCOLHA: com um local, `null` faz o banco resolver — e a chamada
         fica igual à de antes deste PR. */
      local_estoque_id: localId || null,
      motivo,
      /* ⚠ VAZIO VIRA `null`, não string vazia: a coluna é opcional, e `''` gravaria uma observação
         que ninguém escreveu. */
      observacoes: observacoes.trim() || null,
      /* ⚠ SÓ AS CLASSES COM QUANTIDADE: mandar `{quantidade: 0}` seria recusado pelo CHECK do
         banco (`quantidade > 0`) e transformaria um campo vazio em erro. */
      itens: linhas.filter(l => l.qtd > 0).map(l => ({ classe: l.classe, quantidade: l.qtd })),
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Baixar por quebra · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              {formatNum(totais.saldoAtual, 2)} {unidade} disponíveis — perda física, sem dinheiro.
              A baixa reduz o estoque por construção, sem lançamento.
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
          {/* ⚠ O MESMO RÓTULO DA TELA DE ESTOQUE E DO MODAL DE VENDA, pela mesma função. */}
          <p className="text-[11px] text-muted-foreground">{rotuloCulturaUnidade(cultura)}</p>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {['34%', '22%', '22%', '22%'].map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Classe</th>
                  <th className={cn(TH, 'text-right')}>Em estoque</th>
                  <th className={cn(TH, 'text-right')}>Baixar ({unidade})</th>
                  <th className={cn(TH, 'text-right')}>Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  /* ⚠ A CLASSE SEM SALDO NÃO SOME, fica APAGADA — a mesma regra do modal de venda:
                     ela sai do estoque, não da conversa. */
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
                      <CampoNumero valor={itens[l.classe] ?? ''} disabled={l.travada}
                        onChange={v => setItens(o => ({ ...o, [l.classe]: v }))}
                        className={cn('h-7 text-right text-[11px]',
                          l.excede && 'border-destructive focus-visible:ring-destructive')} />
                      {/* ⚠ O ERRO FICA NA LINHA, não num balão no rodapé: com três classes, um
                          aviso genérico obrigaria a conferir as três para achar qual estourou. */}
                      {l.excede && (
                        <div className="mt-0.5 flex items-center gap-1 text-[9px] text-destructive">
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                          acima do saldo ({formatNum(l.saldo, 2)} {unidade})
                        </div>
                      )}
                    </td>
                    <td className={cn('px-2 py-1 text-right text-[11px] font-medium tabular-nums',
                      l.qtd > 0 && 'text-success')}>
                      {formatNum(l.sobra, 2)}
                    </td>
                  </tr>
                ))}
                <tr className={cn(CINZA_CABECALHO, 'text-white')}>
                  <td className="px-2 py-1 text-[11px] font-bold">Total</td>
                  <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                    {formatNum(totais.saldoAtual, 2)}
                  </td>
                  <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                    {totais.baixadas > 0 ? formatNum(totais.baixadas, 2) : '—'}
                  </td>
                  <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                    {formatNum(totais.sobra, 2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ⚠ UMA ANATOMIA POR CÉLULA — rótulo `text-[10px]` em cima, controle `h-8` embaixo com
              `mt-0.5`, nas três. O DatePicker SEM `size="compact"` (que é `h-6`) e o `Select` da
              casa: foi exatamente esse par que desalinhou o modal de venda e custou um PR. */}
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label className="text-[10px]">Data da quebra <span className="text-destructive">*</span></Label>
              <DatePicker value={data} onChange={setData} className="mt-0.5" />
            </div>
            {/* ⚠ O CAMPO SÓ EXISTE COM 2+ LOCAIS — o componente decide, não este modal. Ele entra
                no slot ao lado da data, dentro da grade que já havia: nada muda de lugar. */}
            <LocalEstoqueSelect clienteId={clienteId} value={localId} onChange={setLocalId}
              rotulo="Local" />
            <div>
              <Label className="text-[10px]">Motivo <span className="text-destructive">*</span></Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map(m => (
                    <SelectItem key={m.valor} value={m.valor} className="text-[12px]">
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Observações</Label>
            <Input value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="O que aconteceu — opcional"
              className="mt-0.5 h-8 text-[12px]" />
          </div>
        </div>

        {/* ⚠ O RODAPÉ DIZ O EFEITO, não o total: "baixa X, sobra Y" é a frase que o operador
            confere antes de apertar. Aqui não há valor em R$ para mostrar do lado direito — e a
            ausência é o assunto: quebra é perda física, não despesa. */}
        <div className="flex flex-wrap items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
          <span className="text-[11px]">
            Baixa <strong className="tabular-nums">{formatNum(totais.baixadas, 2)}</strong> {unidade} ·
            sobra <strong className="tabular-nums">{formatNum(totais.sobra, 2)}</strong> {unidade} em estoque
          </span>
          <div className="flex-1" />
          {impedimento && (
            <span className="w-full text-[10px] text-primary-foreground/80 md:w-auto">
              {impedimento}
            </span>
          )}
          <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
            disabled={!!impedimento || salvando} title={impedimento ?? 'Registrar a quebra'}
            onClick={registrar}>
            <Save className="h-3.5 w-3.5" /> Registrar quebra
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

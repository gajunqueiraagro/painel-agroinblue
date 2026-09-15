/**
 * ATUALIZAR A COTAÇÃO — o preço de MERCADO do grão parado (PR-ESTOQUE-VALOR-MERCADO).
 *
 * ⚠ A PERGUNTA QUE ELE RESPONDE NÃO É "quanto eu vendi", É "quanto vale hoje". O estoque já sabia
 * dizer o primeiro — `preco_ref` é a média ponderada do que se entregou, um número do passado.
 * Quem decide segurar ou vender precisa do segundo, e ele não nasce de nenhum lançamento: é um
 * fato de mercado que alguém lê e digita.
 *
 * ⚠ CADA GRAVAÇÃO ACRESCENTA UMA LINHA — a cotação é HISTÓRICO, não cadastro. `agri_cotacao_graos`
 * não tem UNIQUE por (cultura, classe, data) de propósito: registrar duas vezes no mesmo dia
 * guarda as duas, e a leitura usa a mais recente. Um campo de "preço atual" responderia hoje e
 * nenhuma pergunta amanhã.
 *
 * ⚠ A CLASSE EM BRANCO NÃO É ZERO, É "NÃO MEXI NELA". Quem só recebeu a cotação da roça preenche
 * uma linha e deixa duas vazias; gravar zero nas outras apagaria cotações anteriores que
 * continuam valendo. É por isso que o modal filtra e a RPC também.
 */
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker, formatIsoToBr } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import type { EstoqueClasse } from '@/hooks/useEstoqueGraos';
import { TH_CINZA as TH } from '@/lib/idiomaVisual';

/** O que o modal devolve para quem chama a RPC. */
export interface CotacaoGraosPayload {
  data: string;
  fonte: string;
  itens: Array<{ classe: string; preco: number }>;
}

/**
 * ⚠ AS TRÊS CLASSES SEMPRE, venham ou não do estoque — e a razão é que a cotação é um fato de
 * MERCADO, não do saldo. Listar só o que está em mãos impediria de registrar o preço de uma
 * classe na véspera de colhê-la, e são exatamente estas três que o CHECK do banco admite: uma
 * quarta string aqui seria recusada na gravação.
 * ⚠ A ORDEM É A DA QUALIDADE — bom, fora de faixa, refugo —, a mesma da tela e das entregas do
 * barter. É como o produtor pensa o lote.
 */
const CLASSES = ['ate_20', 'acima_20', 'roca'] as const;

export function CotacaoGraosModal({
  aberto, onFechar, onRegistrar, salvando, estoque, cultura, safraRotulo,
}: {
  aberto: boolean;
  onFechar: () => void;
  onRegistrar: (p: CotacaoGraosPayload) => void;
  salvando: boolean;
  /** As classes com o saldo e a cotação vigente — a mesma lista que a tela mostra atrás. */
  estoque: readonly EstoqueClasse[];
  cultura: string;
  safraRotulo: string;
}) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [fonte, setFonte] = useState('manual');
  /** `classe -> preço novo`. `null` = não mexi nesta classe. */
  const [precos, setPrecos] = useState<Record<string, number | null>>({});

  /**
   * ⚠ OS CAMPOS NASCEM VAZIOS, e isto é o OPOSTO do modal de venda — lá o preço nasce preenchido
   * com o de referência porque é um palpite honesto, aqui o vazio É a informação. Pré-preencher
   * com a cotação de ontem faria "salvar sem mexer" gravar a cotação de ontem com a data de hoje,
   * criando um preço que ninguém leu em lugar nenhum.
   * ⚠ E RECOMEÇA A CADA ABERTURA: sem isto, reabrir o modal traria os preços digitados na vez
   * anterior e bastaria um Salvar distraído para registrá-los de novo.
   */
  useEffect(() => {
    if (!aberto) return;
    setPrecos({});
    setFonte('manual');
    setData(new Date().toISOString().slice(0, 10));
  }, [aberto]);

  const linhas = useMemo(() => CLASSES.map(classe => {
    const atual = estoque.find(e => e.classe === classe);
    const novo = precos[classe] ?? null;
    return {
      classe,
      saldo: atual?.saldo ?? 0,
      /* ⚠ "HÁ COTAÇÃO" EXIGE OS DOIS — data E preço maior que zero — e é a MESMA regra da tabela
         atrás, de propósito. `data_mercado` sozinha não basta porque o banco admite gravar zero
         (o CHECK é `>= 0`); o preço sozinho não basta porque a RPC devolve zero também quando
         nunca se cotou. Divergir daqui faria o modal mostrar um preço que a tela chama de "—". */
      precoAtual: atual?.data_mercado && atual.preco_mercado > 0 ? atual.preco_mercado : null,
      dataAtual: atual?.data_mercado && atual.preco_mercado > 0 ? atual.data_mercado : null,
      novo,
      /* ⚠ SÓ `> 0` VAI PARA O BANCO — decisão do briefing. A RPC aceitaria zero (o CHECK é `>= 0`),
         mas um zero digitado aqui é quase sempre um campo que o operador limpou, não uma cotação
         de graça; gravá-lo poria o estoque inteiro valendo nada. */
      grava: novo != null && novo > 0,
    };
  }), [estoque, precos]);

  const totais = useMemo(() => {
    const gravaveis = linhas.filter(l => l.grava);
    return {
      quantas: gravaveis.length,
      /* ⚠ O VALOR PROJETADO É A PRÉVIA DO EFEITO, e ele mistura de propósito: para a classe que
         ganhou preço novo usa o novo, para as outras mantém o que já valia. É exatamente o que a
         tabela vai mostrar depois de salvar — o número que o operador está conferindo antes de
         apertar. */
      projetado: linhas.reduce((a, l) => {
        const preco = l.grava ? (l.novo ?? 0) : (l.precoAtual ?? 0);
        return a + Math.max(l.saldo, 0) * preco;
      }, 0),
      saldo: linhas.reduce((a, l) => a + Math.max(l.saldo, 0), 0),
    };
  }, [linhas]);

  /**
   * ⚠ O MOTIVO DE O BOTÃO ESTAR DESLIGADO FICA ESCRITO AO LADO — regra da OC, e a mesma cadeia
   * única que alimenta `disabled`, `title` e o texto do rodapé, para os três não poderem discordar.
   */
  const impedimento = totais.quantas === 0 ? 'Informe o preço de ao menos uma classe.'
    : !data ? 'Informe a data da cotação.'
      : null;

  const registrar = () => {
    if (impedimento) return;
    onRegistrar({
      data,
      /* ⚠ `manual` COMO PISO, não como placeholder: a coluna é anulável e a RPC já faz o mesmo
         `coalesce`, mas gravar a string vazia deixaria uma fonte que existe e não diz nada. */
      fonte: fonte.trim() || 'manual',
      itens: linhas.filter(l => l.grava).map(l => ({ classe: l.classe, preco: l.novo ?? 0 })),
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Atualizar cotação · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              O preço de mercado de hoje, ao lado do que já foi vendido — cada gravação guarda uma
              nova linha e a tela passa a usar a mais recente.
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
                {['30%', '18%', '26%', '26%'].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Classe</th>
                  <th className={cn(TH, 'text-right')}>Em estoque</th>
                  <th className={cn(TH, 'text-right')}>Cotação atual</th>
                  <th className={cn(TH, 'text-right')}>Novo R$ / sc</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.classe} className="border-t border-slate-100">
                    <td className="truncate px-2 py-1 text-[11px]">
                      <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                        corDaClasse(l.classe))} />
                      {labelDaClasse(l.classe)}
                    </td>
                    {/* ⚠ O SALDO FICA À VISTA porque é ele que dá sentido ao preço: cotar a R$ 98
                        uma classe com zero saca é legítimo (vai colher amanhã) mas não muda número
                        nenhum hoje, e ver a coluna evita a dúvida de por que o total não mexeu. */}
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums text-muted-foreground">
                      {formatNum(l.saldo, 2)}
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums">
                      {/* ⚠ "—" QUANDO NUNCA FOI COTADA, nunca "R$ 0,00": zero ali afirmaria que
                          alguém avaliou o grão em nada, quando o caso é não ter avaliado. */}
                      {l.precoAtual != null ? formatMoeda(l.precoAtual) : '—'}
                      {l.dataAtual && (
                        <span className="ml-1 text-[9px] text-muted-foreground">
                          {formatIsoToBr(l.dataAtual)}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-1">
                      <CampoMoeda valor={precos[l.classe] ?? null} placeholder="—"
                        onChange={v => setPrecos(o => ({ ...o, [l.classe]: v }))}
                        className="h-7 text-right text-[11px]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label className="text-[10px]">
                Data da cotação <span className="text-destructive">*</span>
              </Label>
              <DatePicker value={data} onChange={setData} size="compact" className="mt-0.5" />
            </div>
            <div>
              {/* ⚠ A FONTE É TEXTO LIVRE porque não há lista a oferecer: hoje é "manual", amanhã é
                  o nome de uma corretora ou de um boletim. Um `select` com uma opção só pediria um
                  clique para não escolher nada. */}
              <Label className="text-[10px]">Fonte</Label>
              <Input value={fonte} onChange={e => setFonte(e.target.value)}
                placeholder="manual" className="mt-0.5 h-8 text-[12px]" />
            </div>
          </div>
        </div>

        {/* ⚠ O RODAPÉ DIZ O EFEITO, não só quantas linhas: "o estoque passa a valer X" é a frase
            que o operador confere antes de apertar, e é ela que torna óbvio um preço digitado com
            uma casa a mais. */}
        <div className="flex flex-wrap items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
          <span className="text-[11px]">
            {totais.quantas === 0 ? 'Nenhuma classe preenchida'
              : `${totais.quantas} ${totais.quantas === 1 ? 'classe' : 'classes'} a gravar`}
            {' · '}
            <strong className="tabular-nums">{formatNum(totais.saldo, 2)}</strong> sc em estoque
            passam a valer <strong className="tabular-nums">{formatMoeda(totais.projetado)}</strong>
          </span>
          <div className="flex-1" />
          {impedimento && (
            <span className="w-full text-[10px] text-primary-foreground/80 md:w-auto">
              {impedimento}
            </span>
          )}
          <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
            disabled={!!impedimento || salvando} title={impedimento ?? 'Gravar a cotação'}
            onClick={registrar}>
            <Save className="h-3.5 w-3.5" /> {salvando ? 'Gravando…' : 'Salvar cotação'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

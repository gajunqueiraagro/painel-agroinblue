/**
 * O MODAL DE UMA CARGA DE ENTREGA DIRETA — mandioca industrial, AGRI-MANDIOCA-01c §1.
 *
 * ⚠ MODAL IRMÃO, pelo mesmo motivo da lista: o `CargaModal` da saca estocável tem treze campos do
 * romaneio da cooperativa (verde, seco, umidade, aflatoxina, renda líquida, roça, secagem) e três
 * abas. Nenhum deles existe aqui, e quase todos os daqui não existem lá. Tecer os dois num
 * arquivo só produziria um componente em que cada campo pergunta "de quem eu sou" — e a tela do
 * amendoim, que funciona, pagaria a conta do experimento.
 * ⚠ A CASCA É A MESMA (`LancamentoModalEnvelope`): o que muda é a gramática do dado, não a da casa.
 *
 * ⚠ NENHUMA CONTA, COM UMA EXCEÇÃO DECLARADA. O peso líquido é `bruto − desconto`, e ele é a única
 * derivação permitida — o operador precisa ver a tonelada antes de salvar, e ela é subtração de
 * dois números que ele acabou de digitar. O VALOR BRUTO não se calcula: fica "—" até a RPC
 * responder, e depois mostra o que ela gravou. Multiplicar `t × g × R$/g` aqui daria um segundo
 * número para a mesma carga — e, no dia do arredondamento discordante, seria a tela contra o banco.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Segmentado } from '@/components/ui/segmentado';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { useContasBancariasLeves } from '@/hooks/useContasBancariasLeves';
import { Save, AlertTriangle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { CampoNumero, CampoMoeda } from '@/components/ui/campo-moeda';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { LancamentoModalEnvelope } from '@/components/lancamento/LancamentoModalEnvelope';
import {
  TIPOS_SERVICO, type ServicoDaCarga, type LancamentoTravado,
} from '@/hooks/useCargaMandioca';

/** O mesmo foco fino do modal irmão — anel de 1px, sem o halo de 4. */
const FOCO = 'focus-visible:ring-1 focus-visible:ring-offset-0 focus:ring-1 focus:ring-offset-0';

/* ⚠ O MESMO PARSER DA GRAVAÇÃO (`parseMoeda`): a lateral tem de ler "26.560" igual ao que vai ao
   banco, senão o resumo mostra 26,56 enquanto a RPC recebe 26.560. */
const num = (t: string): number | null => (t.trim() ? parseMoeda(t) : null);

/**
 * O QUE O MODAL EDITA.
 *
 * ⚠ `ids` NO PLURAL, e é o §3 aparecendo aqui: uma carga do backfill tem duas colheitas, e as duas
 * são corrigidas ou canceladas juntas. Guardar um `id` só deixaria a outra metade viva apontando
 * para um lançamento cancelado.
 */
export interface CargaMandiocaForm {
  ids: string[];
  dataColheita: string;
  industriaId: string | null;
  industriaNome: string | null;
  nf: string;
  ticket: string;
  pesoBrutoKg: string;
  descontoKg: string;
  rendimentoG: string;
  precoG: string;
  servicos: ServicoDaCarga[];
  icms: string;
  funrural: string;
  /** Retido da venda, como o Funrural. */
  inss: string;
  /** Custo sobre o frete — não é o ICMS da venda, e não mora no mesmo subcentro. */
  icmsTransporte: string;
  /** ⚠ A conta que paga a carga: sem ela o compromisso não aparece na conciliação. */
  contaId: string | null;
  observacoes: string;
  /** O que a RPC devolveu na última gravação. `null` enquanto não se salvou. */
  valorBruto: number | null;
}

export const cargaMandiocaVazia = (): CargaMandiocaForm => ({
  ids: [],
  dataColheita: new Date().toISOString().slice(0, 10),
  industriaId: null,
  industriaNome: null,
  nf: '',
  ticket: '',
  pesoBrutoKg: '',
  descontoKg: '',
  rendimentoG: '',
  precoG: '',
  servicos: TIPOS_SERVICO.map(s => ({ tipo: s.tipo, fornecedor_id: null, preco_t: null })),
  icms: '',
  funrural: '',
  inss: '',
  icmsTransporte: '',
  contaId: null,
  observacoes: '',
  valorBruto: null,
});

/** O peso líquido em toneladas — a ÚNICA derivação desta tela. */
export function toneladasDaCarga(brutoKg: string, descontoKg: string): number | null {
  const bruto = num(brutoKg);
  if (bruto == null) return null;
  return Math.round(((bruto - (num(descontoKg) ?? 0)) / 1000) * 100) / 100;
}

function Campo({ rotulo, valor, onChange, numerico, casas = 2, obrigatorio, dica }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  numerico?: boolean; casas?: number; obrigatorio?: boolean; dica?: string;
}) {
  return (
    <div>
      <Label className="text-[10px]">
        {rotulo}{obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      {numerico ? (
        <CampoNumero valor={valor} onChange={onChange} casas={casas} title={dica}
          className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
      ) : (
        <Input value={valor} onChange={e => onChange(e.target.value)} title={dica}
          className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
      )}
    </div>
  );
}

/**
 * Um número que a tela NÃO deixa digitar — moldura tracejada, como no modal irmão.
 *
 * ⚠ A BORDA TRACEJADA É O AVISO: um campo derivado com cara de `<input>` convida a corrigir o que
 * o sistema deduziu, e aqui a correção não teria onde ser gravada.
 */
function Derivado({ rotulo, valor, sufixo, dica }: {
  rotulo: string; valor: number | null; sufixo?: string; dica?: string;
}) {
  return (
    <div>
      <Label className="text-[10px]">{rotulo}</Label>
      <div title={dica}
        className={cn('mt-0.5 flex h-8 items-center justify-end gap-1 rounded-md border border-dashed',
          'bg-muted/30 px-2 font-mono text-[12px] tabular-nums',
          valor == null && 'text-muted-foreground')}>
        {valor != null ? formatNum(valor, 2) : '—'}
        {sufixo && <span className="text-[9px] text-muted-foreground">{sufixo}</span>}
      </div>
    </div>
  );
}

/** Um par rótulo–valor do resumo lateral, no idioma do modal irmão. */
function Par({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-0.5">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      <span className={cn('tabular-nums', forte ? 'text-[12px] font-bold text-foreground' : 'text-[11px] text-foreground')}>
        {valor}
      </span>
    </div>
  );
}

export function CargaMandiocaModal({
  aberto, form, clienteId, areas, areaId, safraRotulo, fazendaNome, salvando,
  icmsTravado, travados, onAreaChange, onChange, onFechar, onSalvar,
}: {
  aberto: boolean;
  form: CargaMandiocaForm | null;
  clienteId: string | null | undefined;
  areas: readonly { id: string; pastoNome: string; area_plantada_ha: number }[];
  areaId: string;
  safraRotulo: string;
  fazendaNome: string | null;
  salvando: boolean;
  /**
   * A NF desta carga já tem ICMS lançado por outra carga.
   *
   * ⚠ TRAVAR É DIZER A VERDADE SOBRE O QUE VAI SER GRAVADO: a RPC lança o ICMS UMA VEZ por nota e
   * descarta o repetido em silêncio. Sem a trava, o operador digitaria o valor na segunda carga da
   * mesma nota e a tela teria prometido um lançamento que nunca existiria.
   */
  icmsTravado: boolean;
  /** Os lançamentos que impediram a última tentativa — a RPC recusou e nada mudou. */
  travados: LancamentoTravado[];
  onAreaChange: (id: string) => void;
  onChange: (f: CargaMandiocaForm) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  /* ⚠ ABA ÚNICA, E ELA EXISTE: o envelope reserva a altura da faixa de abas, e sem nada ali o
     modal abriria com uma tira vazia no topo. Uma aba só também nomeia o que se está lançando. */
  const [aba, setAba] = useState<'carga'>('carga');
  /* ⚠ O MODAL BUSCA AS CONTAS, como a `AbaCompromissosOC` faz: elas são do cliente, não da carga,
     e passá-las por prop obrigaria a `CargasDaArea` a carregá-las só para repassar. */
  const { contas } = useContasBancariasLeves(clienteId);

  /* ⚠ O VALOR GRAVADO SOME QUANDO O ROMANEIO MUDA: ele é a resposta da RPC para os números
     ANTERIORES, e mantê-lo na tela depois de mexer no peso mostraria o valor de uma carga que não
     é mais esta. "—" diz "salve para saber", que é a verdade. */
  useEffect(() => {
    if (!aberto) setAba('carga');
  }, [aberto]);

  if (!form) return null;

  const campo = (k: keyof CargaMandiocaForm, v: string) => onChange({ ...form, [k]: v, valorBruto: null });
  /**
   * ⚠ CORRIGIR ESTÁ TRAVADO — PR-CARGA-MANDIOCA-TRAVAR-CORRIGIR, e isto é contenção, não desenho.
   *
   * `agri_carga_mandioca_corrigir` é `cancelar + registrar`: ela apaga a carga e a recria com o
   * que o formulário mandar. E o formulário reaberto NÃO tem o que recriar — os serviços voltam
   * em branco por decisão declarada, e `abrirCargaMandioca` nunca leu `icms` nem `funrural`.
   * Salvar uma carga reaberta apagava frete, trator, mão de obra, ICMS e Funrural, sem aviso.
   * ⚠ E FUNDIA AS METADES: `corrigir` usa `ids[0]` como principal, manda o peso da METADE que a
   * tela mostra e cancela o resto. Medido em 21/09/2026 na NF 9287581 — 40,34 t viraram 12,15 t,
   * seis lançamentos viraram um, R$ 16.402,85 sumiram. 20 das 21 cargas vivas têm duas metades.
   * ⚠ O DEFEITO É ANTIGO; o que mudou foi a barreira que o escondia. Até o conserto da leitura do
   * peso (PR-CARGA-MANDIOCA-PESO-P0-01) o campo abria vazio e a RPC recusava com "peso bruto
   * obrigatorio" — corrigir simplesmente não funcionava. Com o peso preenchido, passou a gravar.
   * ⚠ `ids.length > 0` É O MESMO DISCRIMINADOR QUE O GRAVADOR USA (`CargasDaArea`, no despacho
   * entre `corrigir` e `registrar`). Travar por outro critério abriria uma terceira resposta para
   * a pergunta "esta carga já existe?".
   * A trava sai quando o modal souber editar a carga INTEIRA e devolver serviços e impostos.
   */
  const corrigindo = form.ids.length > 0;
  const t = toneladasDaCarga(form.pesoBrutoKg, form.descontoKg);
  const traco = (v: number | null, casas = 2, sufixo = '') =>
    (v == null ? '—' : `${formatNum(v, casas)}${sufixo}`);

  const servico = (tipo: ServicoDaCarga['tipo']) =>
    form.servicos.find(s => s.tipo === tipo) ?? { tipo, fornecedor_id: null, preco_t: null };
  const mudarServico = (tipo: ServicoDaCarga['tipo'], patch: Partial<ServicoDaCarga>) => {
    onChange({
      ...form,
      servicos: TIPOS_SERVICO.map(s => (s.tipo === tipo
        ? { ...servico(tipo), ...patch }
        : servico(s.tipo))),
      valorBruto: null,
    });
  };

  /* ⚠ O TOTAL DOS SERVIÇOS É O DA PROPOSTA, e a tela o marca como tal: `preço × tonelada` do que
     está NA CAIXA, para o operador conferir a ordem de grandeza antes de salvar. Quem grava é a
     RPC, e é o número dela que a lista vai mostrar depois. */
  const servicosT = form.servicos.reduce((a, s) => a + (s.preco_t ?? 0), 0);
  const servicosPrevisto = t != null ? Math.round(servicosT * t * 100) / 100 : null;
  const notaTotal = (num(form.icms) ?? 0) + (num(form.funrural) ?? 0);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        className="max-w-5xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <LancamentoModalEnvelope
          titulo={`Carga · Mandioca${safraRotulo ? ` · Safra ${safraRotulo}` : ''}`}
          data={form.dataColheita}
          fazendaNome={fazendaNome}
          onFechar={onFechar}
          acao={(
            <Button type="button" variant="acao" onClick={onSalvar}
              disabled={salvando || corrigindo}
              /* ⚠ O MOTIVO TAMBÉM NO `title`, além do aviso no corpo — regra da OC: botão
                 desabilitado diz por quê, e a mesma frase governa os dois. */
              title={corrigindo
                ? 'Edição de carga em reconstrução — salvar apagaria os serviços e os impostos.'
                : undefined}
              className="gap-1">
              <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar carga'}
            </Button>
          )}
          resumo={(
            <div className="divide-y">
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Talhão
                </div>
                <Par rotulo="Área" valor={areas.find(a => a.id === areaId)
                  ? `${areas.find(a => a.id === areaId)?.pastoNome} · ${formatNum(areas.find(a => a.id === areaId)?.area_plantada_ha ?? 0, 2)} ha`
                  : '—'} />
                <Par rotulo="Comprador" valor={form.industriaNome || '—'} />
                <Par rotulo="Ticket" valor={form.ticket.trim() || '—'} />
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Peso
                </div>
                <Par rotulo="Bruto" valor={traco(num(form.pesoBrutoKg), 2, ' kg')} />
                <Par rotulo="Desconto" valor={traco(num(form.descontoKg), 2, ' kg')} />
                <Par rotulo="Líquido" valor={traco(t, 2, ' t')} forte />
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Rendimento
                </div>
                <Par rotulo="Amido" valor={traco(num(form.rendimentoG), 0, ' g')} forte />
                <Par rotulo="Preço" valor={num(form.precoG) != null
                  ? `${formatMoeda(num(form.precoG))}/g` : '—'} />
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Valor
                </div>
                {/* ⚠ "—" ATÉ SALVAR, e é o ponto do §1: o valor é da RPC. */}
                <Par rotulo="Bruto" forte
                  valor={form.valorBruto != null ? formatMoeda(form.valorBruto) : '—'} />
                <Par rotulo="Serviços" valor={servicosPrevisto != null
                  ? formatMoeda(servicosPrevisto) : '—'} />
                <Par rotulo="Nota" valor={notaTotal > 0 ? formatMoeda(notaTotal) : '—'} />
              </div>
            </div>
          )}>

          <div className="flex min-h-0 flex-col">
            {/* ⚠ O SEGMENTADO DA CASA, não o `TabsTrigger` do Radix — regra permanente do
                CLAUDE.md. Com uma aba só ele é rótulo e marcação ao mesmo tempo, e continua
                falando o mesmo navy que o resto do sistema usa para "aberto". */}
            <div className="shrink-0 border-b pb-1">
              <Segmentado valor={aba} onEscolher={setAba}
                opcoes={[{ valor: 'carga', rotulo: 'Carga' }]} />
            </div>

            <div className="flex flex-col gap-2 rounded-b-md border border-t-0 bg-card p-2.5">
              {/* ⚠ A RECUSA APARECE INTEIRA E NO TOPO. `_cancelar` devolve a lista de lançamentos
                  já realizados ou conciliados e NÃO muda nada; dizer só "não foi possível" deixaria
                  o operador sem saber qual baixa desfazer no Financeiro. */}
              {/* ⚠ O AVISO VEM ANTES DE TUDO e diz o que se PERDERIA, não "não é possível": o
                  operador precisa saber que o risco é apagar lançamentos, senão ele tenta de novo
                  por outro caminho. */}
              {corrigindo && (
                <div className="rounded-md border border-amber-500/50 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-950/30">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    Edição de carga em reconstrução — não é possível salvar por ora
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-amber-800/90 dark:text-amber-300/90">
                    Salvar recriaria a carga do zero e ela perderia os serviços e os impostos, que
                    não voltam preenchidos nesta tela. Para conferir os números, a carga está
                    aberta aqui em leitura.
                  </p>
                </div>
              )}

              {travados.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    A carga não foi alterada — há lançamento realizado ou conciliado
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {travados.map(l => (
                      <li key={l.lancamento_id} className="text-[10px] text-muted-foreground">
                        {l.descricao || l.lancamento_id}
                        {l.status && <span className="text-destructive"> · {l.status}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-[1.1fr_2fr] gap-2">
                <div>
                  <Label className="text-[10px]">Data <span className="text-destructive">*</span></Label>
                  <DatePicker value={form.dataColheita}
                    onChange={v => onChange({ ...form, dataColheita: v, valorBruto: null })}
                    className="mt-0.5" />
                </div>
                <div>
                  <Label className="text-[10px]">Talhão <span className="text-destructive">*</span></Label>
                  <Select value={areaId} onValueChange={onAreaChange}>
                    <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]', FOCO)}>
                      <SelectValue placeholder="Escolha o talhão desta carga" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map(a => (
                        <SelectItem key={a.id} value={a.id} className="text-[12px]">
                          {a.pastoNome} · {formatNum(a.area_plantada_ha, 2)} ha
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ⚠ "COMPRADOR", NÃO "FORNECEDOR": quem paga a carga é a indústria, e o rótulo tem
                  de dizer o papel dela nesta operação. O cadastro por trás é o mesmo — um
                  `financeiro_fornecedores` —, e é ele que a RPC exige em `p_industria_id`. */}
              {/* ⚠ A CONTA ENTROU NESTA LINHA, e ela não é detalhe: sem conta o compromisso não
                  aparece na conciliação — `fn_extrato_conciliar_mes` escolhe candidatos por
                  `conta_efetiva_id`. A RPC grava por direção; aqui se escolhe uma vez, para os
                  seis lançamentos da carga.
                  ⚠ E NÃO SE INFERE: o NJ tem dez contas correntes ativas. O que vem pronto é a
                  conta da ÚLTIMA carga deste talhão, no mesmo contrato âmbar dos preços de
                  serviço — proposta que o operador confere, nunca decisão da tela. */}
              <div className="grid grid-cols-[2fr_1.4fr_1fr_1fr] items-end gap-2">
                {clienteId ? (
                  <FornecedorSelect
                    clienteId={clienteId}
                    label="Comprador"
                    required
                    placeholder="A indústria que recebe a carga"
                    fornecedorId={form.industriaId}
                    onFornecedorChange={(id, nome) =>
                      onChange({ ...form, industriaId: id, industriaNome: nome, valorBruto: null })}
                  />
                ) : <div />}
                <div>
                  <Label className="text-[10px]">Conta *</Label>
                  <ContaBancariaSelect
                    value={form.contaId ?? '__none__'}
                    onValueChange={v => onChange({ ...form, contaId: v === '__none__' ? null : v, valorBruto: null })}
                    contas={contas.map(c => ({
                      id: c.id, nome_conta: c.nome_conta, nome_exibicao: c.nome_exibicao,
                      tipo_conta: c.tipo_conta ?? null,
                    }))}
                    placeholder="Quem paga"
                    className={cn('mt-0.5 h-8 text-[12px]', FOCO)}
                  />
                </div>
                <Campo rotulo="NF" valor={form.nf} onChange={v => campo('nf', v)}
                  dica="A nota da indústria — é ela que agrupa o ICMS." />
                <Campo rotulo="Ticket" valor={form.ticket} onChange={v => campo('ticket', v)} />
              </div>

              <div className="grid grid-cols-5 gap-2">
                <Campo rotulo="Peso bruto (kg)" valor={form.pesoBrutoKg} numerico obrigatorio
                  dica="O que a balança da indústria pesou."
                  onChange={v => campo('pesoBrutoKg', v)} />
                <Campo rotulo="Desconto (kg)" valor={form.descontoKg} numerico
                  dica="Terra e impureza descontados no ticket."
                  onChange={v => campo('descontoKg', v)} />
                {/* ⚠ A ÚNICA CONTA DA TELA — ver o cabeçalho do arquivo. */}
                <Derivado rotulo="Peso líquido (t)" valor={t} sufixo="t"
                  dica="Peso bruto menos o desconto, em toneladas." />
                <Campo rotulo="Rendimento (g)" valor={form.rendimentoG} numerico casas={0} obrigatorio
                  dica="Gramas de amido por 5 kg de raiz, do laudo da indústria."
                  onChange={v => campo('rendimentoG', v)} />
                <Campo rotulo="Preço (R$/g)" valor={form.precoG} numerico obrigatorio
                  dica="O preço negociado por grama de rendimento."
                  onChange={v => campo('precoG', v)} />
              </div>

              <div className="grid grid-cols-[1fr_1fr] gap-2">
                {/* ⚠ O VALOR BRUTO NÃO SE DIGITA NEM SE CALCULA: ele é o que a RPC gravou. */}
                <Derivado rotulo="Valor bruto (R$)" valor={form.valorBruto}
                  dica={form.valorBruto == null
                    ? 'A indústria fecha o valor: ele aparece depois de salvar, como a RPC gravou.'
                    : 'O valor do lançamento de venda desta carga.'} />
                <Campo rotulo="Observações" valor={form.observacoes}
                  onChange={v => campo('observacoes', v)} />
              </div>

              {/* ── SERVIÇOS POR TONELADA ── */}
              <div className="rounded-md border p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Serviços por tonelada
                  </span>
                  {/* ⚠ O ÂMBAR DIZ "PROPOSTA, CONFIRA": os preços vêm da última carga da safra, e
                      o operador é quem sabe se o arranquio desta semana mudou. */}
                  <span className="text-[9px] text-amber-700">
                    proposta da última carga · confira
                  </span>
                  <div className="flex-1" />
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {servicosPrevisto != null ? `≈ ${formatMoeda(servicosPrevisto)}` : '—'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {TIPOS_SERVICO.map(({ tipo, rotulo }) => {
                    const s = servico(tipo);
                    /* ⚠ ÂMBAR SÓ ENQUANTO FOR PROPOSTA — a carga gravada não tem proposta
                       nenhuma, e pintar de âmbar um número já conferido mentiria sobre o estado. */
                    const proposto = form.ids.length === 0 && s.preco_t != null;
                    return (
                      <div key={tipo} className="grid grid-cols-[0.6fr_2fr_1fr] items-end gap-2">
                        <span className="pb-2 text-[10px] text-muted-foreground">{rotulo}</span>
                        {clienteId ? (
                          <FornecedorSelect
                            clienteId={clienteId}
                            label=""
                            placeholder="Prestador"
                            fornecedorId={s.fornecedor_id}
                            onFornecedorChange={id => mudarServico(tipo, { fornecedor_id: id })}
                          />
                        ) : <div />}
                        <div>
                          <Label className="text-[10px]">R$/t</Label>
                          <CampoMoeda valor={s.preco_t}
                            onChange={n => mudarServico(tipo, { preco_t: n })}
                            className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO,
                              proposto && 'border-amber-500 bg-amber-50 text-amber-900')} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── NOTA ── */}
              <div className="rounded-md border p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Nota
                </div>
                {/* ⚠ QUATRO COLUNAS, E A ORDEM SEGUE A NATUREZA: os três primeiros são retidos da
                    VENDA (dedução de receita); o ICMS de transporte é CUSTO sobre o frete e fica
                    por último, separado, porque cai noutro subcentro do DRE. */}
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr] items-end gap-2">
                  <div>
                    <Label className="flex items-center gap-1 text-[10px]">
                      ICMS (R$)
                      {icmsTravado && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
                    </Label>
                    <CampoMoeda valor={icmsTravado ? 0 : num(form.icms)}
                      disabled={icmsTravado}
                      onChange={n => campo('icms', n == null ? '' : String(n))}
                      className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO,
                        icmsTravado && 'bg-muted text-muted-foreground')} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Funrural (R$)</Label>
                    <CampoMoeda valor={num(form.funrural)}
                      onChange={n => campo('funrural', n == null ? '' : String(n))}
                      className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
                  </div>
                  <div>
                    <Label className="text-[10px]">INSS (R$)</Label>
                    <CampoMoeda valor={num(form.inss)}
                      onChange={n => campo('inss', n == null ? '' : String(n))}
                      className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
                  </div>
                  <div>
                    {/* ⚠ "DO FRETE" NO RÓTULO, e não é zelo: sem isso ele lê como o ICMS de cima e
                        o operador digita o mesmo número duas vezes. Este vai para Transporte
                        Agrícola (13090), junto do frete que ele tributa. */}
                    <Label className="text-[10px]">ICMS do frete (R$)</Label>
                    <CampoMoeda valor={num(form.icmsTransporte)}
                      onChange={n => campo('icmsTransporte', n == null ? '' : String(n))}
                      className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
                  </div>
                </div>
                {/* ⚠ O MOTIVO DE ESTAR DESLIGADO FICA ESCRITO ABAIXO, não só no `title` — a
                    regra da OC. Aqui ele diz QUAL nota já levou o imposto.
                    ⚠ E SAIU DA GRADE: com quatro campos não sobra coluna para a frase, e espremê-la
                    cortaria justamente o número da nota, que é o que ela veio dizer. */}
                <div className="mt-1">
                  <span className="text-[10px] leading-snug text-muted-foreground">
                    {icmsTravado
                      ? `ICMS da venda já lançado na NF ${form.nf || '—'} — uma vez por nota. O do frete é por carga.`
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </LancamentoModalEnvelope>
      </DialogContent>
    </Dialog>
  );
}

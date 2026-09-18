/**
 * A CLASSIFICAÇÃO DE UM LANÇAMENTO — Atividade, Subcentro, Safra, Cultura e Fase.
 * PAR-01a-ii, passo 2 de 2 do extract.
 *
 * ⚠ ESTE CÓDIGO NÃO É NOVO: saiu inteiro do `LancamentoV2Dialog`, movido byte a byte. Se algo
 * aqui parece estranho, a explicação está no comentário ao lado — todos vieram junto.
 *
 * ⚠ POR QUE EXTRAIR: o parcelamento precisa da MESMA classificação, e a regra é grande e
 * cruzada — trocar a atividade limpa o subcentro de outro escopo e a safra cruzada; escolher um
 * subcentro sobrescreve a atividade (o plano manda sobre o card); administrativo limpa a safra;
 * cultura só em lavoura, fase só em pecuária. Copiar isso para a segunda tela seria garantir que
 * as duas divergissem na primeira regra nova — foi o que o 133g já custou com o seletor de conta.
 *
 * ⚠ CONTROLADO, E O ESTADO DO DADO FICA NO PAI. Os quatro fluxos que escrevem a classificação de
 * fora — hidratar ao editar, transferência, prefill e reset — são do ciclo de vida do diálogo, e
 * continuam lá. Aqui moram só os três estados de INTERAÇÃO (`safraSugeridaId`,
 * `safraEditadaAMao`, `subcentroLimpoPelaAtividade`): memória de quem está digitando, não dado
 * gravado.
 *
 * ⚠ DEVOLVE UM FRAGMENT, NUNCA UM WRAPPER. Os campos são filhos DIRETOS de uma
 * `grid grid-cols-12` que também tem o Valor e as Contas; um `<div>` a mais aqui viraria uma
 * célula só e empurraria a grade inteira. Passa em TSC e em build — só a tela pega.
 *
 * ⚠ `ehAdministrativo` É CALCULADO AQUI E TAMBÉM NO PAI, e não é duplicação de regra: os dois
 * chamam `escopoDoSubcentro`, a função pura da casa, que saiu do modal justamente para a Mesa
 * reusá-la. O pai precisa dela para o payload (`safraParaGravar`) e para travar a Fazenda.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { ATIVIDADES, lembrarAtividade, type Atividade } from '@/lib/financeiro/ultimaAtividade';
import { safraSugerida } from '@/lib/agri/safraSugerida';
import { escopoDoSubcentro, AVISO_ADMIN_SEM_SAFRA, AVISO_ADMIN_SAFRA_SAI } from '@/lib/financeiro/escopoDoSubcentro';
import { CULTURAS_LANCAMENTO, FASES, SEM_CULTURA } from '@/lib/agri/rateioLancamento';
import type { ClassificacaoItem, Safra } from '@/hooks/useFinanceiroV2';

/** Os dez campos de classificação — os mesmos nomes que o save usa. */
export interface ClassificacaoValor {
  atividade: Atividade | null;
  safra_id: string;
  cultura: string;
  fase: string;
  subcentro: string;
  macro_custo: string;
  grupo_custo: string;
  centro_custo: string;
  escopo_negocio: string;
  plano_conta_id: string | null;
}

/* ⚠ A MESMA STRING DE CLASSES DO MODAL, exportada daqui para não virar duas: o pai a usa nos
   campos dele (valor, datas, contas) e o cluster nos seus. Uma cópia divergiria no dia em que
   alguém ajustasse o foco de um lado só. */
export const CAMPO_BG = "bg-background border-[hsl(210_20%_80%)] focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]";

/** Converte texto livre em atividade conhecida — `null` quando não reconhece. */
export const atividadeValida = (v: string | null | undefined): Atividade | null =>
  ATIVIDADES.some((a) => a.valor === v) ? (v as Atividade) : null;

export function ClassificacaoLancamento({
  value, onChange, classificacoes, safras, dataCompetencia,
  culturasDaSafra = [], subcentroDesabilitado = false, tipoOperacao, travado = false,
}: {
  value: ClassificacaoValor;
  /**
   * ⚠ ACEITA OBJETO **OU** UPDATER FUNCIONAL, e é o updater que importa — PAR-01a-ii-fix1.
   * Quem resolve a função é o `useState` do PAI, sobre o estado VIVO. Resolvê-la aqui, sobre o
   * `value` que este render recebeu, foi o defeito: ver a nota do `setClassificacao` abaixo.
   */
  onChange: (proximo: ClassificacaoValor | ((anterior: ClassificacaoValor) => ClassificacaoValor)) => void;
  classificacoes: ClassificacaoItem[];
  safras?: Safra[];
  /** A competência que dispara a sugestão de safra. */
  dataCompetencia: string;
  /**
   * As culturas com área plantada naquela safra — ORDENAM, nunca filtram.
   * ⚠ VEM POR PROP porque `useCulturasDaSafra` não tem cache: o pai também a usa (no aviso de
   * rateio) e chamar dos dois lados seria duas consultas por safra. Quem montar este componente
   * sem ela passa `[]` e perde só o atalho de "plantada primeiro".
   */
  culturasDaSafra?: string[];
  /** O `disabled` do subcentro — é do pai (título de OC, transferência travada). */
  subcentroDesabilitado?: boolean;
  /**
   * ⚠ DOIS ACRÉSCIMOS QUE A EXTRAÇÃO EXIGIU, e estão aqui declarados em vez de puxados por
   * dentro:
   * `tipoOperacao` — o `PlanoSubcentroSelect` filtra a lista por ele (entrada × saída ×
   *   transferência); sem ele o seletor ofereceria contas do lado errado.
   * `travado` — é o `subcentroTravado` do pai (transferência com plano fixo). Ele desabilita
   *   TAMBÉM as pílulas de Atividade, e por isso não dá para reaproveitar o
   *   `subcentroDesabilitado`: aquele inclui `isOCTitulo`, que hoje NÃO trava a atividade.
   *   Fundi-los mudaria comportamento.
   */
  tipoOperacao: string;
  travado?: boolean;
}) {
  /* ⚠ O ADAPTADOR QUE FEZ ESTE PR SER UM *MOVE*: com `setClassificacao` aqui e os campos
     desestruturados com os nomes antigos, os handlers e o JSX abaixo entraram VERBATIM, sem uma
     edição. Reescrevê-los para `onChange({...value, x})` em cada ponto seria a chance de errar
     um — e este PR não pode mudar comportamento.
     ⚠ ELE SÓ REPASSA, E ISSO É O CONSERTO — PAR-01a-ii-fix1. Antes ele resolvia a função aqui:
     `onChange(fn(value))`. E `value` é o do CLOSURE deste render — não o estado vivo do pai.
     No primeiro mount (a `key` remonta este bloco a cada abertura), `value` ainda é o vazio: o
     efeito de sugestão rodava, fazia `fn(vazio)` e devolvia ao pai o objeto VAZIO inteiro com só
     a `safra_id` trocada — apagando os dez campos que a hidratação tinha acabado de pôr. O modal
     abria em branco sobre um lançamento cheio.
     ⚠ QUEM RESOLVE AGORA É O `useState` DO PAI, que aplica o updater sobre o valor mais recente.
     O `...c` de cada handler passa a mesclar com o estado vivo, não com uma foto velha. */
  const setClassificacao = (fn: ClassificacaoValor | ((c: ClassificacaoValor) => ClassificacaoValor)) =>
    onChange(fn);
  const {
    atividade, safra_id: safraId, cultura, fase, subcentro,
    macro_custo: macroCusto, grupo_custo: grupoCusto, centro_custo: centroCusto,
    escopo_negocio: escopoNegocio,
  } = value;
  /* O nome que o JSX movido usa — ver a nota da interface. */
  const subcentroTravado = travado;
  const fieldBg = CAMPO_BG;
  const [subcentroSearch, setSubcentroSearch] = useState('');

  const [subcentroLimpoPelaAtividade, setSubcentroLimpoPelaAtividade] = useState(false);
  /**
   * A SAFRA SE SUGERE, MAS NÃO SE IMPÕE — PR-FIN-ATIVIDADE-01b.
   *
   * ⚠ DOIS ESTADOS PARA UMA COISA SÓ, e cada um responde uma pergunta diferente:
   * `safraSugeridaId` é "este valor foi posto por mim ou escolhido por ele?" — é o que
   * permite substituir a sugestão quando a data muda sem apagar uma escolha; e
   * `safraEditadaAMao` é "ele já disse o que quer?" — a partir daí a sugestão cala até o
   * modal fechar. Sem o segundo, escolher a safra e depois corrigir a data desfaria a
   * escolha, e o operador teria de escolher de novo sem entender por quê.
   */
  /**
   * O subcentro com que o modal ABRIU — PR-FIN-DRE-BADGE-01.
   *
   * ⚠ NÃO É REDUNDANTE COM `lancamento.subcentro`: o valor de abertura pode vir do plano da
   * transferência (que o modal resolve ao abrir) e não do que está gravado. O badge precisa
   * saber se o operador MEXEU, e mexer é diferente de divergir do banco.
   */
  const [safraSugeridaId, setSafraSugeridaId] = useState<string | null>(null);
  const [safraEditadaAMao, setSafraEditadaAMao] = useState(false);

  const aplicarAtividade = (v: Atividade) => {
    const nova = atividade === v ? null : v;
    lembrarAtividade(nova);
    /* ⚠ UM `set` SÓ PARA A REGRA INTEIRA — PAR-01a-i. Eram até oito setters em sequência; o
       React os agrupava no mesmo render, mas o leitor tinha de juntá-los de cabeça para saber
       em que estado o formulário ficava. Agora a regra se lê como uma transição: do objeto
       atual para o próximo. */
    /* ⚠ O EIXO DA OUTRA ATIVIDADE SAI NA HORA — AGRI-MODAL-CULTURA-01. Escolher Amendoim e
       depois trocar para Pecuária deixaria um custo de pecuária marcado como custo direto de
       amendoim no DRE da lavoura. O `culturaParaGravar`/`faseParaGravar` também protege o
       payload; limpar aqui é para a TELA não mostrar o que não vai gravar. */
    setClassificacao((c) => ({
      ...c,
      atividade: nova,
      cultura: nova !== 'agricultura' ? '' : c.cultura,
      fase: nova !== 'pecuaria' ? '' : c.fase,
    }));
    if (!nova) { setSubcentroLimpoPelaAtividade(false); return; }
    /* Mesma comparação do save: aparar e ignorar caixa. */
    const alvo = (subcentro || '').trim().toLowerCase();
    const atual = classificacoes.find((c) => (c.subcentro || '').trim().toLowerCase() === alvo);
    const escopoAtual = (atual?.escopo_negocio || '').trim();
    if (atual && escopoAtual && escopoAtual !== nova) {
      setClassificacao((c) => ({
        ...c, subcentro: '', macro_custo: '', grupo_custo: '', centro_custo: '',
        escopo_negocio: '', plano_conta_id: null,
      }));
      setSubcentroLimpoPelaAtividade(true);
    }
    /* ⚠ A SAFRA DE OUTRA ATIVIDADE TAMBÉM SAI, e volta a ser sugerida — PR-FIN-SAFRA-ESCOPO-01.
       Mantê-la seria guardar o conflito para o operador descobrir no save, depois de ter
       preenchido o resto. Limpar aqui devolve o campo ao ciclo da sugestão, que é onde ele
       estava antes de a atividade mudar. */
    const safraAtual = (safras ?? []).find((sf) => sf.id === safraId);
    const escopoSafra = (safraAtual?.escopo_negocio || '').trim();
    if (safraAtual && escopoSafra && escopoSafra !== nova) {
      setClassificacao((c) => ({ ...c, safra_id: '' }));
      setSafraSugeridaId(null);
      setSafraEditadaAMao(false);
    }
  };

  const safrasDoCard = useMemo(() => {
    const todas = safras ?? [];
    if (!atividade) return todas;
    return todas.filter(sf =>
      (sf.escopo_negocio || '').trim() === atividade || sf.id === safraId);
  }, [safras, atividade, safraId]);

  /* ⚠ ELAS ORDENAM, NUNCA FILTRAM — AGRI-MODAL-CULTURA-01/02. Filtrar pela área cadastrada
     escondeu "Mandioca" de um lançamento de "Catação de Raiz - Mandioca" na 25/26, porque a
     única área plantada da safra era de amendoim: o operador ficou sem como classificar um
     custo que existe. O custo chega ANTES do talhão. O que sobra do estreitamento é o atalho:
     quem já tem área na safra vem primeiro. */
  const culturasOferecidas = useMemo(() => {
    const plantadas = CULTURAS_LANCAMENTO.filter(c => culturasDaSafra.includes(c.valor));
    const demais = CULTURAS_LANCAMENTO.filter(c => !culturasDaSafra.includes(c.valor));
    return [...plantadas, ...demais];
  }, [culturasDaSafra]);

  /* ⚠ NUNCA DEVOLVE O UUID — FIN-AUDITORIA-CULTURA-01 item 2. `loadSafras` só traz as ativas,
     e a consolidação de 12/09 inativou cinco: um lançamento que aponte para uma delas não acha
     o nome, e o `title` exibiria o UUID. "safra inativa" explica por que o campo parece vazio
     num lançamento que TEM safra gravada. */
  const safraNome = (id: string) => (safras ?? []).find((s) => s.id === id)?.nome ?? 'safra inativa';

  /* ⚠ A MESMA REGRA DO PAI, PELA MESMA FUNÇÃO PURA — `escopoDoSubcentro` é da casa (saiu do
     modal para a Mesa reusá-la). O pai a chama para o payload e para travar a Fazenda; aqui ela
     desabilita a Safra. Duas chamadas, uma regra. */
  const escopoDoPlano = escopoDoSubcentro(classificacoes, subcentro, escopoNegocio);
  const ehAdministrativo = escopoDoPlano === 'administrativo' || atividade === 'administrativo';

  useEffect(() => {
    if (safraEditadaAMao) return;
    if (safraId && safraId !== safraSugeridaId) return;
    const nova = atividade && atividade !== 'administrativo'
      ? safraSugerida(dataCompetencia, atividade, safras ?? [], { desempatar: false })
      : null;
    /* ⚠ OS DOIS GUARDS ACIMA NÃO MUDARAM — PAR-01a-i, e são eles que impedem a sugestão de
       atropelar a hidratação: `safraEditadaAMao` cala depois da escolha manual, e
       `safraId !== safraSugeridaId` cala quando o campo já tem valor que não veio daqui —
       exatamente o caso do lançamento antigo que acabou de ser carregado. Só a FORMA do set
       mudou. */
    setClassificacao((c) => ({ ...c, safra_id: nova ?? '' }));
    setSafraSugeridaId(nova);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atividade, dataCompetencia, safras, safraEditadaAMao]);
  return (
    <>
            {/* ── LINHA 4 — Classificação INCORPORADA: Safra + Subcentro ──
                Resumo automático (Macro · Grupo · Centro) SOMENTE LEITURA abaixo do Subcentro,
                a partir dos derivados já existentes. Mesmos estados/ids/handlers/validação da
                antiga aba Classificação (movida verbatim). */}
            <div className="grid grid-cols-12 gap-2 items-start">
              {/* ── Atividade — PR-FIN-ATIVIDADE-01 (D13). Vem ANTES do Subcentro porque é o
                     que encolhe a lista dele: o plano passou de 137 para 206 subcentros em
                     10/09 e continua crescendo; digitar "combust" devolvia pecuária,
                     agricultura e silvicultura juntas.
                     ⚠ A VERSÃO QUE ROLAVA NUMA LINHA SÓ MORREU na homologação de 10/09: em
                     coluna estreita as quatro pílulas saíam ilegíveis ou cortadas. Viraram
                     grade 2×2 de 50px, e a altura do campo é DECLARADA pela grade — não
                     depende do rótulo, que é o que a A16 pede. */}
              <div className="col-span-4">
                <Label className="text-[10px]">Atividade</Label>
                {/* ⚠ 2×2 EM 50px, E ESTA É A ÚNICA LINHA DO MODAL MAIS ALTA QUE 32 — decisão
                    do Gabriel na homologação de 10/09. A versão anterior espremia as quatro
                    pílulas em 32px com entrelinha de 11: cabia, mas ninguém lia. Aqui a
                    pílula tem 24px de altura e 11px de texto, e a linha cresce para 50 —
                    os vizinhos alinham pelo topo (`items-start`), então os rótulos ficam na
                    mesma altura e só o campo da atividade é mais alto. */}
                <div className="grid grid-cols-2 gap-0.5">
                  {ATIVIDADES.map((a) => {
                    const marcada = atividade === a.valor;
                    return (
                      <button
                        key={a.valor}
                        type="button"
                        disabled={subcentroTravado}
                        onClick={() => aplicarAtividade(a.valor)}
                        aria-pressed={marcada}
                        className={cn(
                          'h-6 rounded-full border text-center text-[11px] transition-colors',
                          subcentroTravado && 'opacity-45',
                          'truncate px-2',
                          marcada
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {a.rotulo}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Subcentro — PR-U2c-1D: <PlanoSubcentroSelect /> (fonte única) */}
              <div className="col-span-8">
                <PlanoSubcentroSelect
                  value={subcentro}
                  onChange={(v) => setClassificacao((c) => ({ ...c, subcentro: v }))}
                  onSelected={(_sub, cls) => {
                    if (cls) {
                      /* ⚠ O PLANO MANDA — a precedência do card. Escolher um subcentro de
                         outro escopo (possível com a lista completa, ou com "Mostrar todos")
                         move a pílula para o escopo que veio. O card é preferência de quem
                         olha; o plano é o dado.
                         ⚠ A chave da linha ESCOLHIDA vai junto. `?? null` porque nem toda
                         entrada da lista tem uma: as combinações legadas e os dividendos não
                         têm.
                         ⚠ CONTA ADMINISTRATIVA LIMPA A SAFRA NO MESMO `set` — PR-FIN-SAFRA-
                         ADM-01. Antes eram dois setters em pontos diferentes do mesmo `if`;
                         agora a transição inteira se lê de uma vez. */
                      const ehAdm = (cls.escopo_negocio || '').trim() === 'administrativo';
                      setClassificacao((c) => ({
                        ...c,
                        macro_custo: cls.macro_custo,
                        grupo_custo: cls.grupo_custo || '',
                        centro_custo: cls.centro_custo,
                        escopo_negocio: cls.escopo_negocio || '',
                        plano_conta_id: cls.id ?? null,
                        atividade: atividadeValida(cls.escopo_negocio),
                        safra_id: ehAdm ? '' : c.safra_id,
                      }));
                      setSubcentroLimpoPelaAtividade(false);
                      /* ⚠ É o mesmo gesto de quando o card muda: escolher no meio da sessão
                         é decisão de agora, e o campo esvazia. O RISCADO fica reservado para o
                         que já estava gravado — ali o operador precisa ver o que vai sair. */
                      if (ehAdm) {
                        setSafraSugeridaId(null);
                        setSafraEditadaAMao(false);
                      }
                    } else {
                      /* ⚠ SEM ITEM, SEM CHAVE — nunca a anterior. Hoje não acontece (o
                         seletor só oferece o que está no seu próprio mapa), mas um `id`
                         velho ao lado de um subcentro novo é o único par que o trigger
                         resolveria para o lado errado, e ele obedece à chave. */
                      setClassificacao((c) => ({ ...c, plano_conta_id: null }));
                    }
                  }}
                  escopoNegocio={atividade ?? undefined}
                  classificacoes={classificacoes}
                  tipoOperacao={tipoOperacao}
                  search={subcentroSearch}
                  onSearchChange={setSubcentroSearch}
                  label="Subcentro *"
                  triggerClassName={fieldBg}
                  tabIndex={11}
                  disabled={subcentroDesabilitado}
                />
                {/* ⚠ CAMPO LIMPO DIZ POR QUÊ — mesma regra do campo travado abaixo. Trocar a
                    atividade apaga um subcentro de outro escopo, e um campo que esvazia
                    sozinho sem explicação parece defeito. Este modal não tem idioma de
                    "obrigatório vazio" (a validação é por toast no save), então a frase ao
                    lado é o idioma que existe aqui. */}
                {subcentroLimpoPelaAtividade && !subcentro && (
                  <div className="mt-0.5 text-[10px] leading-snug text-destructive">
                    o subcentro anterior era de outra atividade — escolha um novo
                  </div>
                )}
                {/* ⚠ CAMPO TRAVADO DIZ POR QUÊ, ao lado — a mesma regra do botão
                    desabilitado. Sem a frase, o operador vê um select apagado com um valor
                    que ele não escolheu e procura o defeito. */}
                {subcentroTravado && (
                  <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    transferência entre contas usa esta conta do plano e nenhuma outra (fora
                    da DRE); troque o Tipo Operação para liberar
                  </div>
                )}
                {/* Resumo automático dos derivados (Macro › Grupo › Centro). Somente leitura;
                    sem estado novo, sem recálculo, sem edição. "—" quando não houver derivação. */}
                <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  {(macroCusto || grupoCusto || centroCusto) ? (
                    <>
                      Macro: <span className="font-medium text-foreground/70">{macroCusto || '—'}</span>
                      {' · '}Grupo: <span className="font-medium text-foreground/70">{grupoCusto || '—'}</span>
                      {' · '}Centro: <span className="font-medium text-foreground/70">{centroCusto || '—'}</span>
                    </>
                  ) : '—'}
                </div>
              </div>
            </div>

            {/* ── LINHA B — Safra. Ela não cabe na linha da classificação: medido, o nome
                 mais longo do subcentro pede 291,5px e a pílula "Administrativo" 90,4, e as
                 doze colunas de 666px não comportam os três inteiros (4+6+4 = 14). Entre
                 truncar dois nomes e usar uma linha a mais, a linha a mais é mais barata. */}
            <div className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-4">
                <Label className="text-[10px]">Safra</Label>
                <Select
                  value={safraId || '__none_safra__'}
                  disabled={ehAdministrativo}
                  onValueChange={v => { setClassificacao((c) => ({ ...c, safra_id: v === '__none_safra__' ? '' : v })); setSafraEditadaAMao(true); setSafraSugeridaId(null); }}
                >
                  {/* ⚠ 12px E `truncate` COM `title` — o nome inteiro cabe nesta largura
                      (medido: "Safra 26/27 Amendoim" pede 132,9px e a coluna dá 216,7),
                      mas nomes futuros podem não caber, e aí o title é quem responde. */}
                  <SelectTrigger
                    title={safraId ? safraNome(safraId) : undefined}
                    className={cn('h-8 text-xs [&>span]:truncate', fieldBg,
                      safraSugeridaId && safraId === safraSugeridaId && 'border-dashed border-primary',
                      /* ⚠ RISCADO SÓ QUANDO HÁ O QUE RISCAR. O traço diz "este valor não vai
                         sobreviver ao save"; num campo vazio ele não diria nada. */
                      ehAdministrativo && safraId && 'line-through opacity-60')}>
                    <SelectValue placeholder="Sem safra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none_safra__">Sem safra</SelectItem>
                    {/* ⚠ ORDEM CRONOLÓGICA PURA — FIN-SAFRA-ORDEM-02 (decisão do Gabriel,
                        11/09/2026), desfazendo o "candidatas primeiro" do FIN-ATIVIDADE-01b.
                        A lista sai na ordem em que a fonte a entrega (`ordem_exibicao` asc,
                        desempate por `nome`, em `loadSafras`): 21/22 no topo, 26/27 embaixo,
                        em qualquer competência.
                        ⚠ PÔR DUAS SAFRAS AO ALCANCE DA MÃO CUSTOU A ORDEM DE TODAS. Com
                        25/26 Amendoim e Mandioca no topo e 21/22 logo abaixo, quem procura
                        uma safra pela posição não acha nenhuma — e procurar pela posição é o
                        que se faz numa lista que já está ordenada.
                        ⚠ A SUGESTÃO NÃO MUDOU: a safra sugerida continua pré-selecionada e
                        marcada (borda tracejada + "sugerida"), agora no seu lugar
                        cronológico. O que saiu foi o empilhamento, não a sugestão. */}
                    {safrasDoCard.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* ⚠ SUGERIDA DIZ QUE É SUGERIDA. Um campo que se preenche sozinho e não
                    avisa é um campo que ninguém confere — e safra errada só aparece no
                    fechamento, meses depois. */}
                {safraSugeridaId && safraId === safraSugeridaId && !ehAdministrativo && (
                  <div className="mt-0.5 text-[10px] leading-snug text-primary">sugerida</div>
                )}
                {/* ⚠ LISTA VAZIA DIZ POR QUÊ. Silvicultura não tem nenhuma safra cadastrada
                    hoje (medido: 37 de pecuária, 9 de lavoura, zero de silvicultura), e um
                    dropdown só com "Sem safra" parece defeito da tela em vez de ausência no
                    cadastro. */}
                {!ehAdministrativo && atividade && safrasDoCard.length === 0 && (
                  <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    Nenhuma safra de {ATIVIDADES.find(a => a.valor === atividade)?.rotulo} cadastrada.
                  </div>
                )}
                {/* ⚠ CAMPO DESABILITADO DIZ POR QUÊ — mesmo idioma do subcentro travado da
                    transferência, dez linhas acima. Um campo que apaga sozinho e fica cinza
                    sem explicação parece defeito, e o operador vai procurá-lo em outro lugar.
                    ⚠ DUAS FRASES PORQUE SÃO DOIS FATOS: com safra, o que importa é avisar que
                    ela SAI ao salvar; sem safra, o que importa é dizer que o campo não se
                    aplica. Uma frase só teria de mentir num dos dois casos. */}
                {ehAdministrativo && (
                  <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    {safraId ? AVISO_ADMIN_SAFRA_SAI : AVISO_ADMIN_SEM_SAFRA}
                  </div>
                )}
              </div>

              {/* ── CULTURA (lavoura) ou FASE (pecuária) — AGRI-MODAL-CULTURA-01.
                   ⚠ AO LADO DA SAFRA, e não numa linha nova: safra e cultura são a mesma
                   pergunta em dois níveis ("de qual ciclo" e "de qual parte dele"), e quem
                   preenche uma confere a outra.
                   ⚠ SILVICULTURA E ADMINISTRATIVO NÃO TÊM CAMPO NENHUM: eucalipto não é
                   cultura de lavoura (é atividade própria) e administrativo não é de
                   ninguém. Campo que não se aplica não fica cinza — não existe.
                   ⚠ E A FRASE É O PULO DO GATO: "vazio" aqui não é esquecimento, é a escolha
                   de ratear. Sem ela, o operador leria o campo em branco como pendência e
                   preencheria por via das dúvidas — transformando custo compartilhado em
                   custo direto da primeira cultura da lista. */}
              {atividade === 'agricultura' && (
                <div className="col-span-4">
                  <Label className="text-[10px]">Cultura</Label>
                  <Select value={cultura || SEM_CULTURA}
                    onValueChange={v => setClassificacao((c) => ({ ...c, cultura: v === SEM_CULTURA ? '' : v }))}>
                    <SelectTrigger className={cn('h-8 text-xs [&>span]:truncate', fieldBg)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_CULTURA}>Todas (rateia)</SelectItem>
                      {culturasOferecidas.map(c => (
                        <SelectItem key={c.valor} value={c.valor}>
                          {c.label}
                          {/* A marca diz por que ela está no topo — sem ela, a ordem pareceria
                              arbitrária, e ordem sem motivo se lê como bug. */}
                          {culturasDaSafra.includes(c.valor) && (
                            <span className="ml-1 text-[10px] text-muted-foreground">· plantada</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {atividade === 'pecuaria' && (
                <div className="col-span-4">
                  <Label className="text-[10px]">Fase</Label>
                  <Select value={fase || SEM_CULTURA}
                    onValueChange={v => setClassificacao((c) => ({ ...c, fase: v === SEM_CULTURA ? '' : v }))}>
                    <SelectTrigger className={cn('h-8 text-xs [&>span]:truncate', fieldBg)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_CULTURA}>Todas (rateia)</SelectItem>
                      {FASES.map(f => (
                        <SelectItem key={f.valor} value={f.valor}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
    </>
  );
}

/**
 * Os seis editores que o 129c destravou — data comp./venc./pgto., safra, conta e
 * observação. MESA-ENR-UX-01 (129) + 129c.
 *
 * ⚠ ATÉ 06/09 ESTES CAMPOS ERAM LEITURA, e a tela dizia por quê: `fn_classificacao_apply_row`
 * não os gravava. A migration 20260906195410 mudou isso, e o texto "o Salvar ainda não
 * grava este campo" passou a ser mentira — que é a razão de eles virarem editores agora e
 * não depois.
 *
 * ⚠ CONTROLES DA CASA, sempre: `DatePicker` e os selects do design system. `<input
 * type="date">` abre o calendário do SISTEMA OPERACIONAL, com outro idioma e outro formato
 * por locale — e o gate `check:ui-nativo` existe porque isso já voltou uma vez.
 *
 * ⚠ COMMIT NO GESTO, NÃO NA TECLA — a regra da Mesa. Data e select gravam na escolha
 * (não há blur de teclado); a observação é texto livre e grava no blur/Enter, como o
 * Documento. Gravar por tecla faria uma escrita por caractere.
 *
 * ⚠ VAZIO TIRA A PROPOSTA. A RPC trata NULL/vazio como "sem proposta" — e é assim que o
 * operador desfaz uma sugestão sem precisar de um botão de limpar.
 */
import { useEffect, useRef, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import {
  CELULA_EDITAVEL, CELULA_EDITAVEL_DATA, ITEM_DROPDOWN, CELULA_EDITAVEL_COMPACTA, CELULA_EDITAVEL_DATA_COMPACTA,
  GATILHO_CONTA_COMPACTO,
} from './medidasMesa';
import { TIPOS_OPERACAO_RESULTADO, ehTipoTransferencia } from '@/v2/lib/mesa/transferenciaPlano';
import { AVISO_ADMIN_SEM_SAFRA, AVISO_ADMIN_SAFRA_SAI } from '@/lib/financeiro/escopoDoSubcentro';
import { cn } from '@/lib/utils';
import { patchDaConta } from '@/v2/lib/mesa/contaDaLinha';
import {
  CULTURAS_LANCAMENTO, FASES, SEM_CULTURA, avisoCultura, avisoFase,
} from '@/lib/agri/rateioLancamento';
import { DICA_NAO_APAGA, type EixoRateio } from '@/v2/lib/mesa/enriquecimentoView';

type Editar = (patch: Record<string, unknown>) => Promise<void>;

/** As três datas — mesma peça, muda só a chave do patch. */
export function ResultadoDataEditor({ value, valorAtual, campo, onEditar, compacto = false }: {
  value: string | null;
  /** O valor efetivo do lançamento, para o campo não abrir vazio sobre uma data que existe. */
  valorAtual: string | null;
  campo: 'data_competencia' | 'data_vencimento' | 'data_pagamento';
  onEditar: Editar;
  /** Bloco compacto da Mesa (PR-CONC-MESA-ORDEM-03): 16px / 9,5px. */
  compacto?: boolean;
}) {
  const efetivo = value ?? valorAtual ?? '';
  return (
    <DatePicker
      value={efetivo}
      size="compact"
      className={compacto ? CELULA_EDITAVEL_DATA_COMPACTA : CELULA_EDITAVEL_DATA}
      onChange={(novo) => {
        /* Reabrir o calendário e escolher a mesma data não pode custar uma escrita. */
        if ((novo || '') === efetivo) return;
        void onEditar({ [campo]: novo || null });
      }}
    />
  );
}

export function ResultadoSafraEditor({ value, valorAtual, safras, sugeridaId, onEditar, administrativo = false }: {
  value: string | null;
  valorAtual: string | null;
  safras: { id: string; codigo?: string | null; nome?: string | null }[];
  /**
   * A safra que a competência implica — PR-MESA-SUGESTOES-01 §1.
   *
   * ⚠ ELA ENTRA COMO VALOR EXIBIDO e a moldura fica ÂMBAR: é proposta, e o Salvar a grava. O
   * âmbar é o que separa "o sistema deduziu" de "alguém decidiu" — sem ele, o operador leria
   * uma safra escolhida onde há um palpite, e a diferença importa justamente nas linhas que ele
   * revisaria.
   */
  sugeridaId?: string | null;
  onEditar: Editar;
  /**
   * ⚠ ADMINISTRATIVO NÃO TEM SAFRA — MESA-SAFRA-ADM-01, a mesma regra do modal de lançamento,
   * pela mesma função (`ehSubcentroAdministrativo`). Aqui ela faltava, e o efeito era pior que
   * um campo errado: o dropdown ficava ABERTO, o operador clicava para tirar a safra e nada
   * mudava — porque o `update_proposto` gravava, e o trigger do banco zerava depois. A tela
   * parecia quebrada num gesto que o sistema já cumpria por baixo.
   */
  administrativo?: boolean;
}) {
  const SEM = '__sem__';
  /* ⚠ A SUGESTÃO É O ÚLTIMO RECURSO, depois da proposta e do que o lançamento já tem: ela só
     aparece onde não há safra nenhuma, que é exatamente quando a view a calcula. */
  const efetivo = value ?? valorAtual ?? sugeridaId ?? '';
  const ehSugestao = !value && !valorAtual && !!sugeridaId;
  if (administrativo) {
    /* ⚠ NÃO É UM SELECT DESABILITADO, é a leitura do fato: o campo não se aplica. Um `Select`
       cinza ainda convida ao clique — e foi clicando que o operador descobriu que não mudava. */
    /* ⚠ A FRASE VAI NO `title` (PR-CONC-ENRIQ-MESA-CULTURA-FASE-B, decisão do Gabriel): com o segundo controle da linha
       (cultura/fase) o lado da safra tem 148px a 1135, e "— · administrativo não tem safra" pedia 153 (192 com a safra
       riscada) — cortava. Fica o fato visível ("—" ou a safra riscada); a regra não muda. */
    return (
      <span data-testid="safra-administrativo" className="block truncate text-[10px] leading-tight text-muted-foreground"
        title={efetivo ? AVISO_ADMIN_SAFRA_SAI : AVISO_ADMIN_SEM_SAFRA}>
        {efetivo ? <s>{safras.find(s2 => s2.id === efetivo)?.codigo || '—'}</s> : '—'}
      </span>
    );
  }
  return (
    <Select value={efetivo || SEM}
      onValueChange={(v) => {
        const id = v === SEM ? null : v;
        if ((id ?? '') === efetivo) return;
        /* ⚠ `safra_id`, NÃO `safra`. O campo `safra` é o TEXTO que veio do Excel e segue
           carry-only; quem o apply grava é o id. Mandar o texto voltaria em
           `campos_rejeitados` e o operador veria erro num gesto que deu certo. */
        void onEditar({ safra_id: id });
      }}>
      {/* ⚠ ÂMBAR NA MOLDURA, não no texto: o código da safra tem de continuar legível como os
          outros campos, e é a BORDA que diz "isto ainda é proposta". Mesma gramática da proposta
          de serviços do modal de carga. */}
      <SelectTrigger className={cn(CELULA_EDITAVEL, ehSugestao && 'border-amber-500 bg-amber-50')}
        title={ehSugestao ? 'Safra sugerida pela competência — grava ao salvar' : undefined}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM} className={ITEM_DROPDOWN}>— sem safra</SelectItem>
        {safras.map(s => (
          <SelectItem key={s.id} value={s.id} className={ITEM_DROPDOWN}>
            {s.codigo || s.nome || s.id.slice(0, 8)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ResultadoContaEditor({ value, valorAtual, contas, tipoEfetivo, sugeridaId, textoNaoReconhecido, onEditar }: {
  value: string | null;
  valorAtual: string | null;
  contas: ContaSelecionavel[];
  /**
   * O tipo EFETIVO da linha — PR-MESA-CONTA-ENTRADA-01 §2a.
   *
   * ⚠ ELE DECIDE EM QUAL COLUNA A CONTA SE GRAVA, e sem ele este editor escrevia sempre em
   * `conta_bancaria_id`. Numa ENTRADA a conta mora em `conta_destino_id` — 1.392 entradas deste
   * cliente têm `conta_bancaria_id` NULO —, então a escolha do operador ia para a coluna que
   * ninguém lê e a que todos leem ficava como estava.
   */
  tipoEfetivo?: string | null;
  /** A conta que o Excel propõe, quando uma das colunas resolve (§2b). */
  sugeridaId?: string | null;
  /** O texto de conta que o Excel trouxe e ninguém reconheceu (§2c). */
  textoNaoReconhecido?: string | null;
  onEditar: Editar;
}) {
  const efetivo = value ?? valorAtual ?? sugeridaId ?? '';
  const ehSugestao = !value && !valorAtual && !!sugeridaId;

  /**
   * ⚠ "NÃO RECONHECIDA" NO LUGAR DO "—" — §2c, e é o aviso que faltava. O vazio silencioso foi o
   * que escondeu o defeito: a coluna Resultado dizia "—", o operador salvava por cima e a conta
   * ia embora sem nada na tela sugerindo que havia algo a conferir. Com o texto à vista ele lê que
   * a planilha disse algo que o cadastro não conhece.
   * ⚠ E ELE NÃO É UM CAMPO DESABILITADO: o `Select` continua ali, porque escolher a conta à mão é
   * exatamente o que se espera que ele faça em seguida.
   */
  return (
    <div className="min-w-0">
      <ContaBancariaSelect
        value={efetivo}
        contas={contas}
        placeholder="—"
        /* ⚠ `CELULA_EDITAVEL_WRAPPER` NUNCA APLICOU — 133e adendo. Ele é um seletor de
           DESCENDENTE (`[&>button]`), e `ContaBancariaSelect` entrega a `className` ao próprio
           gatilho: a regra procurava um botão filho do botão. Era por isso que a Conta
           bancária saltava na linha de 22px enquanto os outros campos obedeciam. */
        size="compact"
        className={cn((ehSugestao || !!textoNaoReconhecido) && 'border-amber-500 bg-amber-50')}
        onValueChange={(id) => {
          if (id === efetivo) return;
          /* ⚠ A REGRA MORA EM `patchDaConta`, chamada — nunca repetida aqui. E vazio NÃO escreve
             chave nenhuma: proposta vazia é silêncio, nunca "apague o que está lá". Era
             `conta_bancaria_id: id || null`, e esse `null` apagou vinte contas conciliadas. */
          const patch = patchDaConta(tipoEfetivo, id);
          if (Object.keys(patch).length === 0) return;
          void onEditar(patch);
        }}
      />
      {!!textoNaoReconhecido && (
        <div className="truncate text-[9px] leading-tight text-amber-700"
          title={`A planilha diz "${textoNaoReconhecido}", e nenhuma conta do cadastro casa com esse texto.`}>
          não reconhecida: {textoNaoReconhecido}
        </div>
      )}
    </div>
  );
}

/**
 * O TIPO da operação — PR-MESA-TRANSF-01 item 2/3.
 *
 * ⚠ ESCOLHER "TRANSFERÊNCIA" É UM GESTO SÓ, E ELE GRAVA TRÊS COISAS. O tipo sozinho
 * deixaria a linha inválida por construção: o guard `trg_guard_transferencia_destino`
 * recusa transferência sem destino, e uma transferência classificada em qualquer outra
 * conta do plano entra na DRE. Então o mesmo patch leva o tipo, o subcentro 18010 e — se o
 * apelido da planilha resolveu uma conta — o destino. Três idas ao banco para um gesto
 * fariam três estados intermediários inválidos.
 * ⚠ E SAIR DE TRANSFERÊNCIA DESFAZ SÓ O QUE ELA IMPÔS: o subcentro volta a ser proposta
 * livre APENAS se o que estava lá era o 18010 forçado; uma conta escolhida antes pelo
 * operador ou proposta pela planilha sobrevive. O destino sai sempre — a própria RPC o zera
 * quando o tipo deixa de ser transferência, e mantê-lo na tela prometeria o contrário.
 */
export function ResultadoTipoEditor({ value, valorAtual, subcentroTransferencia, subcentroAtualProposto, contaDestinoSugeridaId, transferenciaSugerida = false, onEditar }: {
  value: string | null;
  valorAtual: string | null;
  /**
   * A linha PARECE transferência e o tipo ainda não é — PR-MESA-SUGESTOES-01 §2.
   *
   * ⚠ AQUI A PROPOSTA NÃO VIRA VALOR, e é a diferença para a safra: trocar o tipo grava TRÊS
   * coisas (tipo, 18010 e destino) e exige uma conta de destino que só o operador sabe. Mostrar
   * "Transferência" já escolhido esconderia dele que falta a metade obrigatória do gesto. O
   * âmbar convida; o clique decide.
   */
  transferenciaSugerida?: boolean;
  /** O subcentro da linha 18010 do plano; `null` quando o catálogo ainda não chegou. */
  subcentroTransferencia: string | null;
  /** O subcentro que o Resultado mostra agora — para saber se o 18010 foi imposto por aqui. */
  subcentroAtualProposto: string | null;
  /** A conta que o apelido da planilha resolveu para o destino, se resolveu. */
  contaDestinoSugeridaId: string | null;
  onEditar: Editar;
}) {
  const efetivo = value ?? valorAtual ?? '';
  return (
    <Select value={efetivo || undefined}
      onValueChange={(novo) => {
        if (novo === efetivo) return;
        const patch: Record<string, unknown> = { tipo_operacao: novo };
        if (ehTipoTransferencia(novo)) {
          if (subcentroTransferencia) patch.subcentro = subcentroTransferencia;
          if (contaDestinoSugeridaId) patch.conta_destino_id = contaDestinoSugeridaId;
        } else {
          patch.conta_destino_id = null;
          if (subcentroTransferencia && subcentroAtualProposto === subcentroTransferencia) {
            patch.subcentro = null;
          }
        }
        void onEditar(patch);
      }}>
      <SelectTrigger
        className={cn(CELULA_EDITAVEL, transferenciaSugerida && 'border-amber-500 bg-amber-50')}
        title={transferenciaSugerida
          ? 'Parece uma transferência — escolha "Transferência" para travar a conta 18010 e informar o destino'
          : undefined}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {TIPOS_OPERACAO_RESULTADO.map((t) => (
          <SelectItem key={t.valor} value={t.valor} className={ITEM_DROPDOWN}>{t.rotulo}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A CONTA DE DESTINO da transferência — PR-MESA-TRANSF-01 item 2.
 *
 * ⚠ A ORIGEM SAI DA LISTA. Transferir de uma conta para ela mesma não é movimento nenhum, e
 * oferecer a opção é convidar o operador a criar um lançamento que o extrato nunca vai
 * explicar.
 * ⚠ SEM `valorAtual` COMO PLACEHOLDER SILENCIOSO: o destino do lançamento entra como valor
 * efetivo (o campo não abre vazio sobre um destino que existe), mas o que se GRAVA é a
 * proposta — é por isso que o container exige o campo antes de chamar a RPC.
 */
export function ResultadoContaDestinoEditor({ value, valorAtual, contas, contaOrigemId, onEditar, compacto = false }: {
  value: string | null;
  valorAtual: string | null;
  contas: ContaSelecionavel[];
  contaOrigemId: string | null;
  onEditar: Editar;
  compacto?: boolean;
}) {
  const efetivo = value ?? valorAtual ?? '';
  const elegiveis = contaOrigemId ? contas.filter((c) => c.id !== contaOrigemId) : contas;
  return (
    <ContaBancariaSelect
      value={efetivo}
      contas={elegiveis}
      placeholder="escolha a conta"
      size="compact"
      className={compacto ? GATILHO_CONTA_COMPACTO : undefined}
      onValueChange={(id) => {
        if (id === efetivo) return;
        void onEditar({ conta_destino_id: id || null });
      }}
    />
  );
}

/** Observação — texto livre, commit no blur/Enter (o idioma do Documento). */
export function ResultadoObservacaoEditor({ value, valorAtual, onEditar, compacto = false }: {
  value: string | null;
  valorAtual: string | null;
  onEditar: Editar;
  compacto?: boolean;
}) {
  const inicial = value ?? valorAtual ?? '';
  const [texto, setTexto] = useState(inicial);
  const textoRef = useRef(inicial);
  const baseRef = useRef(inicial);

  useEffect(() => {
    const novo = value ?? valorAtual ?? '';
    setTexto(novo); textoRef.current = novo; baseRef.current = novo;
  }, [value, valorAtual]);

  const commit = () => {
    const v = textoRef.current.trim();
    if (v !== baseRef.current.trim()) { baseRef.current = v; void onEditar({ observacao: v || null }); }
  };

  return (
    <Input
      className={compacto ? CELULA_EDITAVEL_COMPACTA : CELULA_EDITAVEL}
      value={texto}
      onChange={(e) => { textoRef.current = e.target.value; setTexto(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      placeholder="Observação"
      autoComplete="off"
    />
  );
}

/**
 * O SEGUNDO CONTROLE DA LINHA SAFRA: CULTURA (lavoura) OU FASE (pecuária) — PR-CONC-ENRIQ-MESA-CULTURA-FASE-B.
 *
 * ⚠ AS LISTAS E AS FRASES SÃO DO DONO, `src/lib/agri/rateioLancamento.ts` (`CULTURAS_LANCAMENTO`, `FASES`, `SEM_CULTURA`,
 *   `avisoCultura`/`avisoFase`) — o mesmo do modal do Financeiro. Aqui não se redefine lista, rótulo nem regra.
 * ⚠ EXISTE SEMPRE (D1): fora da lavoura e da pecuária é leitura "—", com a mesma largura reservada. Nada aparece ou some.
 * ⚠ VAZIO É ESCOLHA, NÃO FALTA: "Todas (rateia)" / "rateia" é o custo compartilhado — nunca pendência (D7). A frase do
 *   rateio vai no `title` do controle (D10); o slot de 104px da linha não muda de prioridade.
 * ⚠ VALOR (D4): a proposta; senão o do lançamento; senão a sugestão da planilha, em âmbar (D5).
 * ⚠ A SUGESTÃO É O PRIMEIRO ITEM DO MENU, em âmbar ("Mandioca · da planilha"): escolhê-la grava pelo `editar_proposto`
 *   SEM `_sugestao` (é gesto do operador). Na linha não gravada o Salvar também a grava, COM `_sugestao`; na gravada, só o
 *   clique. Escolher outra coisa — "Todas (rateia)" inclusive — vale a escolha e a sugestão some (`onRecusar`).
 * ⚠ A MESA NÃO APAGA (D8): "Todas (rateia)" num lançamento que tem cultura tira a proposta, e o COALESCE do apply mantém
 *   a do lançamento — o controle diz "a Mesa não apaga · mantém" no `title` e na marca `data-nao-apaga`.
 */
export function ResultadoCulturaFaseEditor({
  eixo, value, valorAtual, sugerida, culturasDaSafra = [], gravada = false, naoApaga = false, onEditar, onRecusar,
}: {
  eixo: EixoRateio;
  value: string | null;
  valorAtual: string | null;
  /** A cultura da planilha oferecida (D5) — já filtrada por `culturaSugeridaDaPlanilha`. */
  sugerida?: string | null;
  /** As culturas com área plantada na safra (ordenam, nunca filtram) — `useCulturasDaSafra`. */
  culturasDaSafra?: readonly string[];
  /** Linha gravada: a sugestão só grava no clique (o title diz). */
  gravada?: boolean;
  /** O operador esvaziou numa linha gravada (`camposEsvaziados`): a Mesa não apaga. */
  naoApaga?: boolean;
  /** Ausente = leitura (linha sem `onEditar`). */
  onEditar?: Editar;
  /** O operador escolheu outra coisa que não a sugestão: ela some e o Salvar não a grava. */
  onRecusar?: () => void;
}) {
  const [escolheuRateio, setEscolheuRateio] = useState(false);
  if (eixo === null) {
    return (
      <span data-testid="cultura-fase-leitura" title="não se aplica a esta atividade"
        className="flex h-5 items-center truncate rounded border border-border/60 bg-muted px-1.5 text-[10.5px] text-muted-foreground">
        —
      </span>
    );
  }
  const campo = eixo;
  const SUG = '__sugestao__';
  const lista: ReadonlyArray<{ valor: string; label: string }> = eixo === 'cultura'
    ? [...CULTURAS_LANCAMENTO].sort((a, b) =>
        Number(culturasDaSafra.includes(b.valor)) - Number(culturasDaSafra.includes(a.valor)))
    : FASES;
  const rotulo = (v: string | null) => (v ? (lista.find((x) => x.valor === v)?.label ?? v) : null);
  const ehSugestao = !value && !valorAtual && !!sugerida;
  const efetivo = value ?? valorAtual ?? (ehSugestao ? sugerida ?? null : null);
  const textoRateio = eixo === 'cultura' ? 'Todas (rateia)' : 'rateia';
  const mantem = !value && !!valorAtual && (escolheuRateio || naoApaga);
  const aviso = eixo === 'cultura' ? avisoCultura(efetivo, culturasDaSafra) : avisoFase(efetivo);
  const title = ehSugestao
    ? `${eixo === 'cultura' ? 'Cultura' : 'Fase'} da planilha — ${gravada ? 'escolha no menu para gravar' : 'grava ao salvar'}. ${aviso.texto}`
    : mantem ? `${DICA_NAO_APAGA} — o lançamento continua com ${rotulo(valorAtual)}. ${aviso.texto}`
    : aviso.texto;
  if (!onEditar) {
    return (
      <span data-testid="cultura-fase-leitura" title={title}
        className="flex h-5 items-center truncate rounded border border-border/60 bg-muted px-1.5 text-[10.5px]">
        {rotulo(efetivo) ?? textoRateio}
      </span>
    );
  }
  return (
    /* ⚠ COM SUGESTÃO, O SELECT FICA SEM VALOR (''): se o valor fosse o próprio item da sugestão, o Radix não dispara
       `onValueChange` ao escolhê-lo de novo — o clique que grava (D5, na linha gravada o ÚNICO jeito de gravar) não faria
       nada. O gatilho mostra o rótulo pelo `SelectValue` de qualquer jeito. */
    <Select value={ehSugestao ? '' : (efetivo ?? SEM_CULTURA)}
      onValueChange={(v) => {
        if (v === SUG) { if (sugerida) void onEditar({ [campo]: sugerida }); return; }
        if (sugerida) onRecusar?.();
        if (v === SEM_CULTURA) {
          setEscolheuRateio(true);
          /* sem proposta não há o que tirar; com o lançamento preenchido, o COALESCE mantém (D8) */
          if (value) void onEditar({ [campo]: null });
          return;
        }
        setEscolheuRateio(false);
        if (v === (value ?? valorAtual)) return;
        void onEditar({ [campo]: v });
      }}>
      <SelectTrigger data-testid={`editor-${campo}`} data-nao-apaga={mantem ? 'sim' : undefined}
        className={cn(CELULA_EDITAVEL, ehSugestao && 'border-amber-500 bg-amber-50')} title={title}>
        {/* o texto do gatilho é o rótulo curto (nunca "Mandioca · da planilha", que pediria 109px em 89) */}
        {/* sem valor (a sugestão), o Radix mostra o `placeholder`: o mesmo rótulo */}
        <SelectValue placeholder={rotulo(efetivo) ?? textoRateio}>{rotulo(efetivo) ?? textoRateio}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ehSugestao && sugerida && (
          <SelectItem value={SUG} className={cn(ITEM_DROPDOWN, 'text-amber-300')} data-testid="item-sugestao-planilha">
            {rotulo(sugerida)} · da planilha
          </SelectItem>
        )}
        <SelectItem value={SEM_CULTURA} className={ITEM_DROPDOWN}>{textoRateio}</SelectItem>
        {lista.map((o) => (
          <SelectItem key={o.valor} value={o.valor} className={ITEM_DROPDOWN}>
            {o.label}
            {eixo === 'cultura' && culturasDaSafra.includes(o.valor) && <span className="ml-1">· plantada</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
import { CELULA_EDITAVEL, CELULA_EDITAVEL_DATA, ITEM_DROPDOWN } from './medidasMesa';
import { TIPOS_OPERACAO_RESULTADO, ehTipoTransferencia } from '@/v2/lib/mesa/transferenciaPlano';
import { AVISO_ADMIN_SEM_SAFRA, AVISO_ADMIN_SAFRA_SAI } from '@/lib/financeiro/escopoDoSubcentro';

type Editar = (patch: Record<string, unknown>) => Promise<void>;

/** As três datas — mesma peça, muda só a chave do patch. */
export function ResultadoDataEditor({ value, valorAtual, campo, onEditar }: {
  value: string | null;
  /** O valor efetivo do lançamento, para o campo não abrir vazio sobre uma data que existe. */
  valorAtual: string | null;
  campo: 'data_competencia' | 'data_vencimento' | 'data_pagamento';
  onEditar: Editar;
}) {
  const efetivo = value ?? valorAtual ?? '';
  return (
    <DatePicker
      value={efetivo}
      size="compact"
      className={CELULA_EDITAVEL_DATA}
      onChange={(novo) => {
        /* Reabrir o calendário e escolher a mesma data não pode custar uma escrita. */
        if ((novo || '') === efetivo) return;
        void onEditar({ [campo]: novo || null });
      }}
    />
  );
}

export function ResultadoSafraEditor({ value, valorAtual, safras, onEditar, administrativo = false }: {
  value: string | null;
  valorAtual: string | null;
  safras: { id: string; codigo?: string | null; nome?: string | null }[];
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
  const efetivo = value ?? valorAtual ?? '';
  if (administrativo) {
    /* ⚠ NÃO É UM SELECT DESABILITADO, é a leitura do fato: o campo não se aplica. Um `Select`
       cinza ainda convida ao clique — e foi clicando que o operador descobriu que não mudava. */
    return (
      <span className="block truncate text-[10px] leading-tight text-muted-foreground"
        title={efetivo ? AVISO_ADMIN_SAFRA_SAI : AVISO_ADMIN_SEM_SAFRA}>
        {efetivo ? <s>{safras.find(s2 => s2.id === efetivo)?.codigo || '—'}</s> : '—'}
        <span className="ml-1">· {AVISO_ADMIN_SEM_SAFRA}</span>
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
      <SelectTrigger className={CELULA_EDITAVEL}><SelectValue placeholder="—" /></SelectTrigger>
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

export function ResultadoContaEditor({ value, valorAtual, contas, onEditar }: {
  value: string | null;
  valorAtual: string | null;
  contas: ContaSelecionavel[];
  onEditar: Editar;
}) {
  const efetivo = value ?? valorAtual ?? '';
  return (
    <ContaBancariaSelect
      value={efetivo}
      contas={contas}
      placeholder="—"
      /* ⚠ `CELULA_EDITAVEL_WRAPPER` NUNCA APLICOU — 133e adendo. Ele é um seletor de
         DESCENDENTE (`[&>button]`), e `ContaBancariaSelect` entrega a `className` ao próprio
         gatilho: a regra procurava um botão filho do botão. Era por isso que a Conta
         bancária saltava na linha de 22px enquanto os outros campos obedeciam. */
      size="compact"
      onValueChange={(id) => {
        if (id === efetivo) return;
        void onEditar({ conta_bancaria_id: id || null });
      }}
    />
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
export function ResultadoTipoEditor({ value, valorAtual, subcentroTransferencia, subcentroAtualProposto, contaDestinoSugeridaId, onEditar }: {
  value: string | null;
  valorAtual: string | null;
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
      <SelectTrigger className={CELULA_EDITAVEL}><SelectValue placeholder="—" /></SelectTrigger>
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
export function ResultadoContaDestinoEditor({ value, valorAtual, contas, contaOrigemId, onEditar }: {
  value: string | null;
  valorAtual: string | null;
  contas: ContaSelecionavel[];
  contaOrigemId: string | null;
  onEditar: Editar;
}) {
  const efetivo = value ?? valorAtual ?? '';
  const elegiveis = contaOrigemId ? contas.filter((c) => c.id !== contaOrigemId) : contas;
  return (
    <ContaBancariaSelect
      value={efetivo}
      contas={elegiveis}
      placeholder="escolha a conta"
      size="compact"
      onValueChange={(id) => {
        if (id === efetivo) return;
        void onEditar({ conta_destino_id: id || null });
      }}
    />
  );
}

/** Observação — texto livre, commit no blur/Enter (o idioma do Documento). */
export function ResultadoObservacaoEditor({ value, valorAtual, onEditar }: {
  value: string | null;
  valorAtual: string | null;
  onEditar: Editar;
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
      className={CELULA_EDITAVEL}
      value={texto}
      onChange={(e) => { textoRef.current = e.target.value; setTexto(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      placeholder="Observação"
      autoComplete="off"
    />
  );
}

import type { EventoOC } from '@/hooks/useOperacaoEventos';
import { brl } from '@/components/ui/campo-moeda';

/* TRADUZ um evento de `zoo_operacao_eventos` para uma frase em portugues
   (PR-OC-AUDITORIA-01).
   ⚠ O TRABALHO AQUI NAO E' MOSTRAR, E' TRADUZIR. O payload e' util e cheio de
   identificador cru — `{"parte":{"id":"eac87f2f-…","valor":8100,"lote_id":"9f8ec655-…"}}`.
   Cada acao tem uma frase PROPRIA, montada do payload DELA; nao ha formato generico que
   sirva para as trinta e quatro.
   ⚠ NENHUM IDENTIFICADOR CHEGA A TELA. Id vira nome pelo que a aba JA carregou (via
   `Resolvedores`); nao resolvendo, a frase perde o complemento e mantem o verbo — jamais
   imprime uuid. O detalhe tecnico completo fica no clique, que e' onde ele serve.
   ⚠ O VERBO COMECA EM MINUSCULA: a frase comeca no NOME de quem agiu, na coluna anterior
   ("Gabriel  trocou o fornecedor").

   COBERTURA, medida em 28/08 e nao estimada:
     34 acoes existem no codigo das RPCs (varredura de `prosrc`);
     21 delas ja ocorreram no proto (349 eventos).
   As 21 medidas tem frase montada a partir do payload REAL. As 13 restantes nunca
   dispararam, entao o payload delas nao pode ser conferido: recebem VERBO + `motivo`
   (chave quase universal) e nada mais. Inventar chaves que nunca vi seria escrever
   ficcao que so falharia em producao. Estao listadas em SEM_PAYLOAD_MEDIDO. */

export interface Resolvedores {
  /** id de fornecedor -> nome. Null quando a lista carregada nao o contem. */
  fornecedor: (id: string) => string | null;
  /** id de lote -> rotulo curto ("Lote 2 · garrotes"). */
  lote: (id: string) => string | null;
  /** especie de documento -> rotulo amigavel (vem de quem ja tem o mapa). */
  especie: (e: string) => string;
}

export interface FraseEvento {
  /** A frase principal, comecando por verbo em minuscula. */
  frase: string;
  /** Complemento secundario, na mesma linha e em cinza. Null quando nao acrescenta. */
  detalhe: string | null;
}

/* ╔══════════════════════════════════════════════════════════════════════════════╗
   ║  DIVIDA CONHECIDA — FRASE POBRE DE PROPOSITO, NAO POR DESLEIXO               ║
   ╚══════════════════════════════════════════════════════════════════════════════╝
   Estas 13 acoes EXISTEM nas RPCs e NUNCA ocorreram no proto (varredura de `prosrc`
   x 349 eventos, 28/08). Sem uma ocorrencia real nao da para conferir quais chaves o
   payload traz, entao elas recebem VERBO + `motivo` e mais nada — escrever
   `nov.quantidade` sem nunca ter visto o payload seria ficcao que so quebraria em
   producao, e no lugar onde o erro custa mais caro: a auditoria.

   ⚠ INSTRUCAO PARA QUEM VIER DEPOIS. Ao ver a PRIMEIRA ocorrencia de qualquer uma
   destas acoes na tela, o trabalho e':
     1. ler o evento real —
          select detalhes, dados_anteriores, dados_novos
            from zoo_operacao_eventos where acao = '<a acao>' limit 5;
     2. montar a frase com as chaves QUE ESTAO LA;
     3. tirar a acao desta lista, no mesmo PR.
   A frase curta e' um marcador de "ainda nao medi", nao a forma final. Quem encontrar
   isto daqui a seis meses nao deve concluir que ficou pela metade por descuido. */
export const SEM_PAYLOAD_MEDIDO = [
  'adotar_titulo_financeiro', 'alterar_parcelas', 'cancelar_obrigacao', 'documento_cancelar',
  'editar_negociacao', 'estornar_liquidacao', 'estornar_recebimento', 'gerar_obrigacao',
  'reabrir_para_estorno', 'reabrir_para_reconciliacao', 'registrar_liquidacao',
  'sincronizar_divergente', 'sincronizar_multi_fazenda',
] as const;

// ── acessores seguros sobre jsonb ──────────────────────────────────────────────
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  return s === '' ? null : s;
};
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;
const data = (v: unknown): string | null => {
  const s = txt(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : s;
};
/** Junta as partes que existem, descartando as ausentes. Null quando nada sobrou. */
const junta = (...partes: (string | null)[]) => {
  const ps = partes.filter((p): p is string => !!p);
  return ps.length ? ps.join(' · ') : null;
};
const dinheiro = (v: unknown) => { const n = num(v); return n == null ? null : brl(n); };

/* ── editar_dados: as chaves TOCADAS viram "de X para Y" ─────────────────────────
   ⚠ CHAVE SEM ROTULO NAO E' IMPRESSA. Preferimos dizer menos a exibir `contraparte_id`
   na cara do operador; o clique mostra o par bruto para quem precisar. */
const CAMPO_EDITADO: Record<string, { rotulo: string; verbo: string; valor: 'fornecedor' | 'data' | 'dinheiro' | 'texto' }> = {
  contraparte_id:    { rotulo: 'o fornecedor',            verbo: 'trocou',   valor: 'fornecedor' },
  data_operacao:     { rotulo: 'a data da operação',      verbo: 'alterou',  valor: 'data' },
  numero_documento:  { rotulo: 'o número do documento',   verbo: 'alterou',  valor: 'texto' },
  observacoes:       { rotulo: 'a observação',            verbo: 'alterou',  valor: 'texto' },
  cenario:           { rotulo: 'o cenário',               verbo: 'alterou',  valor: 'texto' },
  valor_acordado:    { rotulo: 'o valor acordado',        verbo: 'alterou',  valor: 'dinheiro' },
  qtd_negociada:     { rotulo: 'a quantidade negociada',  verbo: 'alterou',  valor: 'texto' },
};

function valorLegivel(tipo: string, v: unknown, r: Resolvedores): string | null {
  if (tipo === 'fornecedor') { const id = txt(v); return id ? r.fornecedor(id) : null; }
  if (tipo === 'data') return data(v);
  if (tipo === 'dinheiro') return dinheiro(v);
  return txt(v);
}

function frasearEdicao(e: EventoOC, r: Resolvedores): FraseEvento {
  const antes = obj(e.dadosAnteriores) ?? {};
  const depois = obj(e.dadosNovos) ?? {};
  const chaves = Object.keys(depois).filter(k => CAMPO_EDITADO[k]);
  if (chaves.length === 0) return { frase: 'editou dados da operação', detalhe: null };
  if (chaves.length > 1) {
    const rotulos = chaves.map(k => CAMPO_EDITADO[k].rotulo.replace(/^(o|a) /, ''));
    return { frase: `editou ${chaves.length} campos da operação`, detalhe: rotulos.join(', ') };
  }
  const k = chaves[0];
  const c = CAMPO_EDITADO[k];
  const de = valorLegivel(c.valor, antes[k], r);
  const para = valorLegivel(c.valor, depois[k], r);
  /* Sem os DOIS lados legiveis o "de X para Y" viraria meia verdade — some o complemento
     e fica so o fato, que continua correto. */
  return { frase: `${c.verbo} ${c.rotulo}`, detalhe: de && para ? `${de} → ${para}` : null };
}

// ── a tabela de frases ─────────────────────────────────────────────────────────
export function frasearEvento(e: EventoOC, r: Resolvedores): FraseEvento {
  const d = obj(e.detalhes) ?? {};
  const nov = obj(e.dadosNovos) ?? {};
  const ant = obj(e.dadosAnteriores) ?? {};
  const motivo = txt(d.motivo);

  switch (e.acao) {
    // ── ciclo da operacao ──────────────────────────────────────────────────────
    case 'criar_rascunho':
      return { frase: 'criou a operação', detalhe: junta(data(nov.data_operacao)) };
    case 'salvar_rascunho':
      return { frase: 'salvou os dados da operação', detalhe: null };
    case 'editar_dados':
      return frasearEdicao(e, r);
    /* ⚠ ACOES ESTRUTURAIS: o FATO basta, e a falta de payload nao e' defeito. `fechar`
       carrega a linha inteira da operacao em `dados_anteriores`, mas dizer "fechou a
       operação" ja e' a informacao — o resto e' material do clique. */
    case 'fechar':
      return { frase: 'fechou a operação', detalhe: null };
    case 'reabrir':
      return { frase: 'reabriu a operação', detalhe: motivo };
    case 'cancelar':
      return { frase: 'cancelou a operação', detalhe: motivo };

    // ── negociacao ─────────────────────────────────────────────────────────────
    case 'salvar_lotes': {
      const n = arr(nov.lotes).length;
      const qtd = num(nov.qtd_negociada);
      return {
        frase: n > 0 ? `salvou ${plural(n, 'lote', 'lotes')}` : 'salvou a negociação',
        detalhe: junta(qtd != null ? `${qtd} cab` : null, dinheiro(nov.valor_acordado)),
      };
    }
    case 'editar_negociacao':
      return { frase: 'editou a negociação', detalhe: motivo };

    // ── recebimento ────────────────────────────────────────────────────────────
    case 'receber_lotes': {
      const n = num(nov.itens);
      return { frase: n != null ? `recebeu ${plural(n, 'lote', 'lotes')}` : 'recebeu lotes', detalhe: null };
    }
    case 'registrar_movimentacao': {
      const qtd = num(nov.quantidade);
      const cat = txt(nov.categoria);
      const cabecas = qtd != null ? `${qtd} ${cat ?? 'cab'}` : cat;
      return {
        frase: cabecas ? `registrou a entrada de ${cabecas}` : 'registrou uma movimentação',
        detalhe: junta(dinheiro(nov.valor_total), txt(nov.lote_id) ? r.lote(String(nov.lote_id)) : null),
      };
    }
    case 'estornar_movimentacao':
      return {
        frase: 'estornou uma movimentação',
        detalhe: junta(txt(d.lote_id) ? r.lote(String(d.lote_id)) : null, motivo),
      };
    case 'estornar_recebimento':
      return { frase: 'estornou o recebimento', detalhe: motivo };
    case 'encerrar_entrega': {
      const ef = num(d.efetivo), neg = num(d.negociado);
      return {
        frase: 'encerrou o recebimento',
        detalhe: ef != null && neg != null ? `${ef} de ${neg} cab` : motivo,
      };
    }
    case 'reabrir_entrega':
      return { frase: 'reabriu o recebimento', detalhe: motivo };

    // ── compromissos e programacao ─────────────────────────────────────────────
    case 'criar_compromisso':
      return { frase: 'criou um compromisso', detalhe: junta(txt(nov.descricao), dinheiro(nov.valor_total)) };
    case 'cancelar_compromisso':
      return { frase: 'cancelou um compromisso', detalhe: junta(txt(ant.descricao), motivo) };
    case 'programar_compromisso': {
      const ps = arr(nov.parcelas);
      const soma = ps.reduce<number>((s, p) => s + (num(obj(p)?.valor) ?? 0), 0);
      return {
        frase: ps.length > 0 ? `programou ${plural(ps.length, 'parcela', 'parcelas')}` : 'programou o compromisso',
        detalhe: soma > 0 ? brl(soma) : null,
      };
    }
    case 'acrescentar_parcelas': {
      const ps = arr(nov.parcelas);
      const soma = ps.reduce<number>((s, p) => s + (num(obj(p)?.valor) ?? 0), 0);
      return {
        frase: `acrescentou ${plural(ps.length, 'parcela', 'parcelas')}`,
        detalhe: soma > 0 ? brl(soma) : null,
      };
    }
    case 'alterar_parcelas':
      return { frase: 'alterou as parcelas', detalhe: motivo };
    case 'cancelar_programacao': {
      const n = num(d.parcelas_canceladas);
      return {
        frase: 'cancelou a programação',
        detalhe: junta(n != null ? plural(n, 'parcela', 'parcelas') : null, motivo),
      };
    }

    // ── financeiro ─────────────────────────────────────────────────────────────
    case 'materializar_parcela': {
      const seq = num(obj(nov.parcela)?.sequencia);
      const valor = dinheiro(obj(nov.parcela)?.valor ?? obj(nov.parte)?.valor);
      return { frase: seq != null ? `lançou a parcela ${seq}` : 'lançou uma parcela', detalhe: valor };
    }
    case 'estornar_materializacao': {
      const seq = num(obj(ant.parcela)?.sequencia);
      return {
        frase: seq != null ? `estornou o lançamento da parcela ${seq}` : 'estornou um lançamento',
        detalhe: junta(dinheiro(d.valor), motivo),
      };
    }
    case 'gerar_obrigacao':
      return { frase: 'gerou uma obrigação', detalhe: motivo };
    case 'cancelar_obrigacao':
      return { frase: 'cancelou uma obrigação', detalhe: motivo };
    case 'registrar_liquidacao':
      return { frase: 'registrou um pagamento', detalhe: motivo };
    case 'estornar_liquidacao':
      return { frase: 'estornou um pagamento', detalhe: motivo };
    case 'adotar_titulo_financeiro':
      return { frase: 'vinculou um título financeiro', detalhe: motivo };
    case 'reabrir_para_estorno':
      return { frase: 'reabriu a operação para estorno', detalhe: motivo };
    case 'reabrir_para_reconciliacao':
      return { frase: 'reabriu a operação para reconciliação', detalhe: motivo };
    case 'sincronizar_divergente':
      return { frase: 'sincronizou a operação divergente', detalhe: motivo };
    case 'sincronizar_multi_fazenda':
      return { frase: 'sincronizou a operação entre fazendas', detalhe: motivo };

    // ── documentos ─────────────────────────────────────────────────────────────
    case 'documento_registrar': {
      const esp = txt(nov.especie);
      return { frase: esp ? `registrou ${r.especie(esp)}` : 'registrou um documento', detalhe: null };
    }
    case 'documento_editar':
      return { frase: 'editou um documento', detalhe: null };
    case 'documento_cancelar':
      return { frase: 'cancelou um documento', detalhe: motivo };

    /* ⚠ ACAO DESCONHECIDA nao pode virar linha em branco nem uuid: uma RPC nova amanha
       cai aqui. O nome da acao E' dado — vira texto legivel, e o clique tem o resto. */
    default:
      return { frase: e.acao.replace(/_/g, ' '), detalhe: motivo };
  }
}

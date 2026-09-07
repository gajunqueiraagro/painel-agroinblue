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
import { CELULA_EDITAVEL, CELULA_EDITAVEL_WRAPPER, ITEM_DROPDOWN } from './medidasMesa';

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
      className={CELULA_EDITAVEL}
      onChange={(novo) => {
        /* Reabrir o calendário e escolher a mesma data não pode custar uma escrita. */
        if ((novo || '') === efetivo) return;
        void onEditar({ [campo]: novo || null });
      }}
    />
  );
}

export function ResultadoSafraEditor({ value, valorAtual, safras, onEditar }: {
  value: string | null;
  valorAtual: string | null;
  safras: { id: string; codigo?: string | null; nome?: string | null }[];
  onEditar: Editar;
}) {
  const SEM = '__sem__';
  const efetivo = value ?? valorAtual ?? '';
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
      className={CELULA_EDITAVEL_WRAPPER}
      onValueChange={(id) => {
        if (id === efetivo) return;
        void onEditar({ conta_bancaria_id: id || null });
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

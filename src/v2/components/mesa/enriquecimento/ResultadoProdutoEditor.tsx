// ResultadoProdutoEditor — P0-3. Célula "Resultado" da linha "Produto / Descrição",
// reutilizando o ProdutoAutocomplete OFICIAL (fonte única, busca server-side).
// REGRA DA MESA: NÃO grava por tecla. Buffer local; commit (editarProposto({produto}))
// só no blur / Enter / seleção de sugestão. Valor inicial = proposta (proposto_produto)
// ou, na ausência, a descrição atual do lançamento (edita a descrição existente).
import { useState, useEffect, useRef } from 'react';
import { ProdutoAutocomplete } from '@/components/shared/ProdutoAutocomplete';

export interface ResultadoProdutoEditorProps {
  value: string | null;          // proposto_produto
  descricaoAtual: string | null; // lanc_descricao
  clienteId: string | null | undefined;
  onEditar: (patch: Record<string, unknown>) => Promise<void>;
}

export function ResultadoProdutoEditor({ value, descricaoAtual, clienteId, onEditar }: ResultadoProdutoEditorProps) {
  const inicial = value ?? descricaoAtual ?? '';
  const [text, setText] = useState(inicial);
  const textRef = useRef(inicial);   // valor atual (síncrono, evita corrida no Enter/seleção)
  const baseRef = useRef(inicial);   // último valor commitado (detecta mudança real)

  // Ressincroniza quando o backend muda (refetch após commit).
  useEffect(() => {
    const novo = value ?? descricaoAtual ?? '';
    setText(novo); textRef.current = novo; baseRef.current = novo;
  }, [value, descricaoAtual]);

  const setBoth = (v: string) => { textRef.current = v; setText(v); };
  const commitValue = (raw: string) => {
    const v = raw.trim();
    if (v !== baseRef.current.trim()) { baseRef.current = v; void onEditar({ produto: v }); }
  };

  return (
    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) commitValue(textRef.current); }}>
      <ProdutoAutocomplete value={text} onChange={setBoth} onCommit={commitValue} clienteId={clienteId} inputClassName="h-6 text-[11px]" />
    </div>
  );
}

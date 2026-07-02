// ResultadoDocumentoEditor — P0-5. Célula "Resultado" da linha Documento.
// Input de texto livre (número do documento). REGRA DA MESA: NÃO grava por tecla —
// buffer local; commit (editarProposto({ numero_documento })) só no blur / Enter.
// Valor inicial = proposta (proposto_numero_documento) ou, na ausência, o documento
// atual do lançamento.
import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';

export interface ResultadoDocumentoEditorProps {
  value: string | null;                 // proposto_numero_documento
  numeroDocumentoAtual: string | null;  // lanc_numero_documento
  onEditar: (patch: Record<string, unknown>) => Promise<void>;
}

export function ResultadoDocumentoEditor({ value, numeroDocumentoAtual, onEditar }: ResultadoDocumentoEditorProps) {
  const inicial = value ?? numeroDocumentoAtual ?? '';
  const [text, setText] = useState(inicial);
  const textRef = useRef(inicial);   // síncrono (evita corrida no Enter)
  const baseRef = useRef(inicial);   // último valor commitado

  useEffect(() => {
    const novo = value ?? numeroDocumentoAtual ?? '';
    setText(novo); textRef.current = novo; baseRef.current = novo;
  }, [value, numeroDocumentoAtual]);

  const setBoth = (v: string) => { textRef.current = v; setText(v); };
  const commitValue = () => {
    const v = textRef.current.trim();
    if (v !== baseRef.current.trim()) { baseRef.current = v; void onEditar({ numero_documento: v }); }
  };

  return (
    <Input
      className="h-6 text-[10px] px-2"
      value={text}
      onChange={(e) => setBoth(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => { if (e.key === 'Enter') commitValue(); }}
      placeholder="Nº do documento"
      autoComplete="off"
    />
  );
}

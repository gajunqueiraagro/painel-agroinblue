import { useState, useCallback } from 'react';

/** Format integer with Brazilian thousand separator (1.000, 12.500) */
function formatIntBR(value: string): string {
  const num = parseInt(value.replace(/\D/g, ''), 10);
  if (isNaN(num) || num === 0) return '';
  return num.toLocaleString('pt-BR');
}

/** Format decimal with Brazilian format and fixed decimals (275,50 / 1.250,75) */
function formatDecBR(value: string, decimals: number): string {
  const clean = value.replace(/[^\d.,\-]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Parse a formatted BR string back to raw numeric string */
function parseBR(value: string): string {
  // Remove thousand separators (dots), replace comma with dot
  return value.replace(/\./g, '').replace(',', '.');
}

/**
 * Hook for integer inputs (Qtd. Cabeças).
 * Returns display value (formatted) and raw value (numeric string for state).
 */
export function useIntegerInput(rawValue: string, setRawValue: (v: string) => void) {
  const [displayValue, setDisplayValue] = useState(rawValue);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    setRawValue(v);
    setDisplayValue(v);
  }, [setRawValue]);

  const onBlur = useCallback(() => {
    if (rawValue) {
      setDisplayValue(formatIntBR(rawValue));
    } else {
      setDisplayValue('');
    }
  }, [rawValue]);

  const onFocus = useCallback(() => {
    setDisplayValue(rawValue);
  }, [rawValue]);

  return { displayValue, onChange, onBlur, onFocus };
}

/**
 * Hook for decimal inputs (Peso kg).
 * Returns display value (formatted) and raw value (numeric string for state).
 */
export function useDecimalInput(rawValue: string, setRawValue: (v: string) => void, decimals = 2) {
  const [displayValue, setDisplayValue] = useState(rawValue);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setRawValue(v);
    setDisplayValue(v);
  }, [setRawValue]);

  const onBlur = useCallback(() => {
    if (rawValue) {
      const num = parseFloat(rawValue);
      if (!isNaN(num)) {
        setDisplayValue(formatDecBR(rawValue, decimals));
      } else {
        setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [rawValue, decimals]);

  const onFocus = useCallback(() => {
    setDisplayValue(rawValue);
  }, [rawValue]);

  return { displayValue, onChange, onBlur, onFocus };
}

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export function CustomSelect({ value, onChange, options, placeholder, className }: CustomSelectProps) {
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (value && !options.includes(value) && value !== '') {
      setIsCustom(true);
    } else if (options.includes(value)) {
      setIsCustom(false);
    }
  }, [value, options]);

  const baseClasses = "w-full border border-border bg-secondary/50 outline-none transition-all text-sm";
  const mergedClasses = cn(baseClasses, className);

  if (isCustom) {
    return (
      <div className="relative flex items-center w-full">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(mergedClasses, "pl-10")}
          placeholder={placeholder || "اكتب خيارك المخصص هنا..."}
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setIsCustom(false);
            onChange(options[0] || '');
          }}
          className="absolute left-2 p-1 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-md transition-colors"
          title="العودة للقائمة"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <select
      value={options.includes(value) ? value : '___custom___'}
      onChange={(e) => {
        if (e.target.value === '___custom___') {
          setIsCustom(true);
          onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      className={mergedClasses}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="___custom___">✏️ إضافة خيار مخصص...</option>
    </select>
  );
}


import React from 'react';

// --- Typography & Layout ---

// Added explicit React.FC type to ensure children are recognized correctly
export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-tech text-[11px] uppercase tracking-[0.15em] text-cyan-500/80 mb-2 border-l-2 border-cyan-500/30 pl-2">
    {children}
  </div>
);

// Added explicit title and version typing
export const PanelHeader = ({ title, version }: { title: string; version?: string }) => (
  <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
    <h3 className="font-tech text-xl font-bold text-white tracking-wide">{title}</h3>
    {version && (
      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
        {version}
      </span>
    )}
  </div>
);

// --- Inputs ---

// Fix: Use ComponentPropsWithoutRef to ensure all standard input attributes (value, min, max, etc.) 
// are correctly inherited and recognized by the compiler.
interface InputProps extends React.ComponentPropsWithoutRef<'input'> {
  label?: string;
  rightLabel?: string;
}

export const Slider = ({ label, rightLabel, className, ...props }: InputProps) => (
  <div className={`flex flex-col gap-1.5 mb-2 ${className || ''}`}>
    {(label || rightLabel) && (
      <div className="flex justify-between items-center text-[10px] text-zinc-400 font-medium">
        <span>{label}</span>
        <span className="font-mono text-cyan-200/80">{rightLabel}</span>
      </div>
    )}
    <input 
      type="range" 
      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer focus:outline-none focus:bg-zinc-700 transition-colors"
      {...props} 
    />
  </div>
);

export const TextInput = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={`w-full bg-black/40 border border-white/10 text-zinc-200 text-xs rounded px-2.5 py-2 
      focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 
      placeholder:text-zinc-700 transition-all font-medium ${className || ''}`}
    {...props}
  />
));
TextInput.displayName = "TextInput";

export const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select
      className={`w-full appearance-none bg-zinc-900/50 border border-white/10 text-zinc-300 text-xs rounded px-3 py-2 pr-8
        focus:outline-none focus:border-cyan-500/50 focus:text-white transition-all ${className || ''}`}
      {...props}
    >
      {children}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
      <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
    </div>
  </div>
);

// --- Toggles & Buttons ---

export const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) => (
  <label className="flex items-center justify-between cursor-pointer group py-1">
    <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors font-medium">{label}</span>
    <div className="relative">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-900 peer-checked:after:bg-cyan-400 peer-checked:after:border-cyan-300"></div>
    </div>
  </label>
);

// Explicitly added commonly used button attributes to satisfy the compiler
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children?: React.ReactNode;
}

export const Button = ({ children, variant = 'secondary', icon, className, ...props }: ButtonProps) => {
  const baseStyle = "flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-semibold tracking-wide transition-all duration-200 border";
  
  const variants = {
    primary: "bg-gradient-to-r from-cyan-900 to-cyan-800 hover:from-cyan-800 hover:to-cyan-700 text-cyan-100 border-cyan-500/30 shadow-[0_0_15px_rgba(8,145,178,0.15)]",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5 hover:border-white/20 hover:text-white",
    danger: "bg-red-900/20 hover:bg-red-900/40 text-red-400 border-red-500/20",
    ghost: "bg-transparent border-transparent text-zinc-500 hover:text-zinc-300"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className || ''} disabled:opacity-50 disabled:cursor-not-allowed`} {...props}>
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
};

// --- specialized ---

export const ColorPicker = ({ value, onChange, label }: { value: string, onChange: (val: string) => void, label?: string }) => (
  <div className="flex items-center gap-3 bg-zinc-900/50 p-1.5 rounded border border-white/5">
    {label && <span className="text-[10px] text-zinc-500 w-10 pl-1">{label}</span>}
    <div className="flex-1 h-5 rounded overflow-hidden relative ring-1 ring-white/10">
      <input 
        type="color" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="absolute -top-2 -left-2 w-[150%] h-[200%] cursor-pointer p-0 m-0 border-none" 
      />
    </div>
    <span className="font-mono text-[9px] text-zinc-500 w-14 text-right">{value.toUpperCase()}</span>
  </div>
);

export const FileButton = ({ onFileSelect, accept, label, icon }: { onFileSelect: (f: File) => void, accept: string, label?: string, icon?: React.ReactNode }) => (
  <label className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/5 rounded px-2.5 py-2 flex items-center justify-center cursor-pointer transition-colors h-full">
    {icon || (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    )}
    {label && <span className="ml-2 text-xs">{label}</span>}
    <input 
      type="file" 
      accept={accept}
      className="hidden"
      onChange={(e) => {
          const f = e.target.files?.[0];
          if(f) onFileSelect(f);
      }}
    />
  </label>
);

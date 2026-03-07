import type { ReactNode } from "react";

interface ButtonStandardProps {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

function DirectionsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

export function ButtonStandard({
  children,
  onClick,
  icon,
  disabled = false,
  className = "",
}: ButtonStandardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative w-full h-[54px] overflow-hidden rounded-[4px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <div className="absolute left-0 right-0 h-[54px] rounded-[4px] flex items-center justify-center gap-2 pb-2 pt-1 px-8 bg-[#155dfc] group-hover:bg-[#0f46bf] group-active:bg-[#0f46bf] top-0 group-active:top-[6px] transition-top">
        <span className="shrink-0 flex items-center justify-center w-5 h-5 text-white">
          {icon ?? <DirectionsIcon />}
        </span>
        <span className="font-semibold text-base text-white">{children}</span>
        <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_-6px_0px_0px_#042f8c] group-active:opacity-0" />
      </div>
    </button>
  );
}

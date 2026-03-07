import type { ReactNode } from "react";

/** Blue card used for primary actions (e.g. "I just parked", "Can I park here?", scan options). */
export function CardBlue({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-[#d9eaff] rounded-xl p-6 flex flex-col items-start gap-6 cursor-pointer hover:bg-[#c9ddfb] transition-colors"
    >
      <div className="bg-[#155dfc] rounded-full w-20 h-20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="text-[#2b2b2b] text-2xl font-semibold leading-8 text-left">
        {children}
      </span>
    </button>
  );
}

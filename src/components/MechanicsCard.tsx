import { ReactNode } from 'react';

interface MechanicsCardProps {
  title: string;
  description: ReactNode;
}

export const MechanicsCard = ({ title, description }: MechanicsCardProps) => {
  return (
    <div className="card border border-dim p-[30px] transition-all duration-200 bg-black/70 hover:border-fg hover:shadow-[-5px_5px_0px_var(--tw-shadow-color)] hover:shadow-dim">
      <h3 className="text-[1.75rem] font-bold mb-[15px] border-b border-dim pb-[10px] inline-block">
        {title}
      </h3>
      <p className="text-[1rem] leading-[1.6] text-[#ccc]">{description}</p>
    </div>
  );
};

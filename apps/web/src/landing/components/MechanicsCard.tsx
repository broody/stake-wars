import { ReactNode } from 'react';
import { Panel } from '../../ui';

interface MechanicsCardProps {
  title: string;
  description: ReactNode;
}

export const MechanicsCard = ({ title, description }: MechanicsCardProps) => {
  return (
    <Panel
      as="div"
      tone="strong"
      className="p-[30px] transition-all duration-200 bg-surface/70 hover:border-fg hover:shadow-[-5px_5px_0px_var(--tw-shadow-color)] hover:shadow-line-strong"
    >
      <h3 className="text-title font-bold mb-[15px] border-b border-line-strong pb-[10px] inline-block">
        {title}
      </h3>
      <p className="text-lead text-fg-secondary">{description}</p>
    </Panel>
  );
};

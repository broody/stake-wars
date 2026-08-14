interface StatItemProps {
  label: string;
  value: string;
}

const StatItem = ({ label, value }: StatItemProps) => {
  return (
    <div className="stat-item p-5 border-r border-dim text-center last:border-r-0">
      <div className="stat-label text-[0.8rem] text-[#888] mb-1">{label}</div>
      <div className="stat-value text-[1.5rem] font-bold text-[#ccc]">
        {value}
      </div>
    </div>
  );
};

export const StatsBoard = () => {
  return (
    <div className="stats-board grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] border border-dim mb-20 opacity-70">
      <StatItem label="TOTAL STAKED" value="-- STRK" />
      <StatItem label="ACTIVE OPERATORS" value="STANDING BY" />
      <StatItem label="CURRENT LEADER" value="VACANT" />
    </div>
  );
};

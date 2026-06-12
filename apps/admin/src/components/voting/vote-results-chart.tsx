'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

interface VoteResults {
  for: number;
  against: number;
  abstain: number;
  total: number;
}

interface VoteResultsChartProps {
  results: VoteResults;
}

const COLORS = {
  For: '#16a34a',
  Against: '#dc2626',
  Abstain: '#9ca3af',
};

export function VoteResultsChart({ results }: VoteResultsChartProps) {
  if (results.total === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
        No votes yet
      </div>
    );
  }

  const pct = (n: number) =>
    results.total > 0 ? ((n / results.total) * 100).toFixed(1) : '0';

  const rows = [
    { name: 'For', value: results.for, color: COLORS.For },
    { name: 'Against', value: results.against, color: COLORS.Against },
    { name: 'Abstain', value: results.abstain, color: COLORS.Abstain },
  ];

  return (
    <div className="space-y-3">
      {rows.map(({ name, value, color }) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-14 flex-shrink-0">{name}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct(value)}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-900 w-14 text-right flex-shrink-0">
            {pct(value)}%
          </span>
          <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
            ({value} vote{value !== 1 ? 's' : ''})
          </span>
        </div>
      ))}
      <div className="pt-2 border-t border-gray-100 text-sm text-gray-500">
        Total: <span className="font-semibold text-gray-800">{results.total}</span> votes
      </div>
    </div>
  );
}

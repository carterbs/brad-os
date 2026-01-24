import { Box, Heading } from '@radix-ui/themes';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { ExerciseHistoryEntry } from '@lifting/shared';

interface Props {
  entries: ExerciseHistoryEntry[];
}

interface ChartDataPoint {
  date: string;
  weight: number;
  reps: number;
}

export function WeightProgressionChart({ entries }: Props): JSX.Element {
  const data: ChartDataPoint[] = entries.map(entry => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: entry.best_weight,
    reps: entry.best_set_reps,
  }));

  const weights = entries.map(e => e.best_weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const padding = 5;
  const yMin = Math.max(0, Math.floor((minWeight - padding) / 5) * 5);
  const yMax = Math.ceil((maxWeight + padding) / 5) * 5;

  return (
    <Box data-testid="weight-chart">
      <Heading size="4" mb="3">Weight Progression</Heading>
      <Box
        p="3"
        style={{
          backgroundColor: 'var(--gray-2)',
          borderRadius: 'var(--radius-3)',
        }}
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-5)" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--gray-8)" />
            <YAxis
              domain={[yMin, yMax]}
              label={{ value: 'lbs', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
              tick={{ fontSize: 12 }}
              stroke="var(--gray-8)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--gray-5)',
                borderRadius: 'var(--radius-2)',
                fontSize: 13,
              }}
            />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="var(--blue-9)"
              strokeWidth={2}
              dot={{ fill: 'var(--blue-9)', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

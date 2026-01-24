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

  return (
    <div className="weight-progression-chart" data-testid="weight-chart">
      <h2>Weight Progression</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis label={{ value: 'Weight (lbs)', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Line type="monotone" dataKey="weight" stroke="#8884d8" dot={true} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

import { useParams, Link } from 'react-router-dom';
import { useExerciseHistory } from '../hooks/useExercises';
import { WeightProgressionChart } from '../components/ExerciseHistory/WeightProgressionChart';
import { SetHistoryTable } from '../components/ExerciseHistory/SetHistoryTable';

export function ExerciseHistoryPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const exerciseId = parseInt(id ?? '', 10);
  const { data: history, isLoading, error } = useExerciseHistory(exerciseId);

  if (isLoading) return <div className="loading-spinner">Loading...</div>;
  if (error) return <div className="error-message">Failed to load exercise history</div>;
  if (!history) return <div className="error-message">Exercise not found</div>;

  return (
    <div className="exercise-history-page">
      <Link to="/exercises" className="back-link">&larr; Back to Exercises</Link>
      <h1>{history.exercise_name} - History</h1>

      {history.personal_record && (
        <div className="personal-record">
          <strong>Personal Record:</strong>{' '}
          <span>{history.personal_record.weight} lbs x {history.personal_record.reps} reps ({history.personal_record.date})</span>
        </div>
      )}

      {history.entries.length === 0 ? (
        <p>No history yet</p>
      ) : (
        <>
          <WeightProgressionChart entries={history.entries} />
          <SetHistoryTable entries={history.entries} />
        </>
      )}
    </div>
  );
}

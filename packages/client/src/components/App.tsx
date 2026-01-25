import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalLayout, LiftingLayout, ActivityLayout } from './Layout';
import {
  ExerciseLibraryPage,
  ExerciseHistoryPage,
  PlansPage,
  CreatePlanPage,
  PlanDetailPage,
  EditPlanPage,
  TodayPage,
  WorkoutPage,
  StretchPage,
  MeditationPage,
  MesoPage,
  ActivitiesPage,
  TodayDashboard,
  HistoryPage,
  ProfilePage,
} from '../pages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppRoutes(): JSX.Element {
  return (
    <Routes>
      {/* Global routes - with main bottom nav */}
      <Route element={<GlobalLayout />}>
        <Route path="/" element={<TodayDashboard />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Lifting routes - with lifting bottom nav */}
      <Route path="/lifting" element={<LiftingLayout />}>
        <Route index element={<MesoPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="plans/new" element={<CreatePlanPage />} />
        <Route path="plans/:id" element={<PlanDetailPage />} />
        <Route path="plans/:id/edit" element={<EditPlanPage />} />
        <Route path="exercises" element={<ExerciseLibraryPage />} />
        <Route path="exercises/:id/history" element={<ExerciseHistoryPage />} />
        <Route path="workouts/:id" element={<WorkoutPage />} />
        {/* Legacy today page for lifting-specific view */}
        <Route path="today" element={<TodayPage />} />
      </Route>

      {/* Stretch routes - with back button nav */}
      <Route
        path="/stretch"
        element={<ActivityLayout backPath="/activities" activityName="Stretch" />}
      >
        <Route index element={<StretchPage />} />
      </Route>

      {/* Meditation routes - with back button nav */}
      <Route
        path="/meditation"
        element={<ActivityLayout backPath="/activities" activityName="Meditation" />}
      >
        <Route index element={<MeditationPage />} />
      </Route>
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

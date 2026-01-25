import { Container, Heading, Grid } from '@radix-ui/themes';
import { ActivityCard } from '../components/Activities';

export function ActivitiesPage(): JSX.Element {
  return (
    <Container size="2" p="4">
      <Heading size="6" mb="5">
        Activities
      </Heading>

      <Grid columns={{ initial: '2', sm: '3' }} gap="4">
        <ActivityCard
          id="lifting"
          name="Lifting"
          icon={<DumbbellIcon />}
          path="/lifting"
          color="indigo"
        />
        <ActivityCard
          id="stretch"
          name="Stretch"
          icon={<StretchIcon />}
          path="/stretch"
          color="teal"
        />
        <ActivityCard
          id="meditation"
          name="Meditate"
          icon={<MeditationIcon />}
          path="/meditation"
          color="purple"
        />
      </Grid>
    </Container>
  );
}

function DumbbellIcon(): JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1" />
      <path d="m3 3 1 1" />
      <path d="m18 22 4-4" />
      <path d="m2 6 4-4" />
      <path d="m3 10 7-7" />
      <path d="m14 21 7-7" />
    </svg>
  );
}

function StretchIcon(): JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="4" r="2" />
      <path d="M22 14l-4-4-3 3" />
      <path d="M15 13l-5 5-4-4" />
      <path d="M2 18l4 4" />
      <path d="M18 10l-5 5" />
    </svg>
  );
}

function MeditationIcon(): JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}


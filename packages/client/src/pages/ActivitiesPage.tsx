import { Container, Heading, Grid, Box } from '@radix-ui/themes';
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
        <ActivityCard
          id="cycling"
          name="Cycling"
          icon={<CyclingIcon />}
          path="/cycling"
          color="orange"
          disabled
        />
        <ActivityCard
          id="fishing"
          name="Fishing"
          icon={<FishingIcon />}
          path="/fishing"
          color="cyan"
          disabled
        />
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--gray-3)',
            border: '2px dashed var(--gray-6)',
            borderRadius: '12px',
            padding: '24px 16px',
            color: 'var(--gray-9)',
          }}
        >
          <PlusIcon />
        </Box>
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

function CyclingIcon(): JSX.Element {
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
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h3" />
    </svg>
  );
}

function FishingIcon(): JSX.Element {
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
      <path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6" />
      <path d="M6.5 12a6 6 0 0 0 8.5 5.5" />
      <path d="M15 17.5V22" />
      <path d="M4 4l4 4" />
      <path d="M2 12h4" />
    </svg>
  );
}

function PlusIcon(): JSX.Element {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

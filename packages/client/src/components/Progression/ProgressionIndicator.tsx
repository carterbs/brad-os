import { Flex, Text } from '@radix-ui/themes';

interface ProgressionIndicatorProps {
  willProgress: boolean;
}

function CheckCircleIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.49991 0.877045C3.84222 0.877045 0.877075 3.84219 0.877075 7.49988C0.877075 11.1576 3.84222 14.1227 7.49991 14.1227C11.1576 14.1227 14.1227 11.1576 14.1227 7.49988C14.1227 3.84219 11.1576 0.877045 7.49991 0.877045ZM1.82708 7.49988C1.82708 4.36686 4.36689 1.82704 7.49991 1.82704C10.6329 1.82704 13.1727 4.36686 13.1727 7.49988C13.1727 10.6329 10.6329 13.1727 7.49991 13.1727C4.36689 13.1727 1.82708 10.6329 1.82708 7.49988ZM10.1589 5.53774C10.3178 5.31191 10.2636 5.00001 10.0378 4.84109C9.81194 4.68217 9.50004 4.73642 9.34112 4.96225L6.51977 8.97154L5.35681 7.78706C5.16334 7.59002 4.84677 7.58711 4.64973 7.78058C4.45268 7.97404 4.44978 8.29062 4.64325 8.48766L6.22658 10.1003C6.33054 10.2062 6.47617 10.2604 6.62407 10.2483C6.77197 10.2363 6.90686 10.1591 6.99226 10.0377L10.1589 5.53774Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CrossCircleIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0.877075 7.49988C0.877075 3.84219 3.84222 0.877045 7.49991 0.877045C11.1576 0.877045 14.1227 3.84219 14.1227 7.49988C14.1227 11.1576 11.1576 14.1227 7.49991 14.1227C3.84222 14.1227 0.877075 11.1576 0.877075 7.49988ZM7.49991 1.82704C4.36689 1.82704 1.82708 4.36686 1.82708 7.49988C1.82708 10.6329 4.36689 13.1727 7.49991 13.1727C10.6329 13.1727 13.1727 10.6329 13.1727 7.49988C13.1727 4.36686 10.6329 1.82704 7.49991 1.82704ZM4.5 5.20711L5.20711 4.5L7.5 6.79289L9.79289 4.5L10.5 5.20711L8.20711 7.5L10.5 9.79289L9.79289 10.5L7.5 8.20711L5.20711 10.5L4.5 9.79289L6.79289 7.5L4.5 5.20711Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Visual indicator showing whether an exercise will progress next week
 * based on whether all sets were completed in the current week.
 */
export function ProgressionIndicator({
  willProgress,
}: ProgressionIndicatorProps): JSX.Element {
  if (willProgress) {
    return (
      <Flex
        gap="1"
        align="center"
        data-testid="progression-will-progress"
        title="All sets completed - exercise will progress next week"
        style={{ color: 'var(--green-9)' }}
      >
        <CheckCircleIcon />
        <Text size="1" color="green">
          Will progress
        </Text>
      </Flex>
    );
  }

  return (
    <Flex
      gap="1"
      align="center"
      data-testid="progression-will-not-progress"
      title="Not all sets completed - exercise will not progress next week"
      style={{ color: 'var(--amber-9)' }}
    >
      <CrossCircleIcon />
      <Text size="1" color="amber">
        Incomplete
      </Text>
    </Flex>
  );
}

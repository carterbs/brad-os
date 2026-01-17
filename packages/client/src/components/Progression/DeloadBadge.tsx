import { Badge, Flex } from '@radix-ui/themes';

function LeafIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.49742 13.5016C2.49742 13.5016 3.16227 12.0018 4.02687 11.0622C4.89147 10.1226 5.85837 9.37287 6.70337 8.73637C7.54837 8.09987 8.27137 7.57687 8.27137 7.57687C8.27137 7.57687 8.01437 8.18237 7.68637 8.92437C7.35837 9.66637 6.95912 10.5449 6.95912 10.5449C6.95912 10.5449 8.31162 10.0569 9.51412 9.19637C10.7166 8.33587 11.7691 7.10287 12.2841 5.55887C12.7991 4.01487 12.7766 2.15987 12.0166 1.07987C12.0166 1.07987 10.3516 1.40287 8.80737 2.12787C7.26312 2.85287 5.83962 3.97987 4.95037 5.35037C4.06112 6.72087 3.70612 8.33437 4.08212 9.57287C4.08212 9.57287 4.12012 8.93387 4.27987 8.29037C4.43962 7.64687 4.72112 6.99887 4.72112 6.99887C4.72112 6.99887 3.97837 7.72837 3.29812 8.65537C2.61787 9.58237 2.00037 10.7074 2.00037 10.7074C2.00037 10.7074 2.49742 13.5016 2.49742 13.5016Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Badge component indicating a deload week with recovery information.
 * Deload weeks use 85% weight and 50% volume for recovery.
 */
export function DeloadBadge(): JSX.Element {
  return (
    <Badge
      color="blue"
      variant="soft"
      size="2"
      data-testid="deload-badge"
      title="Recovery Week: 50% volume (reduced sets), 85% weight (lighter loads)"
    >
      <Flex gap="1" align="center">
        <LeafIcon />
        Deload Week
      </Flex>
    </Badge>
  );
}

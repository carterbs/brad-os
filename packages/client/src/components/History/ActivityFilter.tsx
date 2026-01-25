import { Flex, Button } from '@radix-ui/themes';

export type ActivityFilterType = 'all' | 'workout' | 'stretch' | 'meditation';

interface ActivityFilterProps {
  value: ActivityFilterType;
  onChange: (value: ActivityFilterType) => void;
}

const filterOptions: { value: ActivityFilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'workout', label: 'Lifting' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'meditation', label: 'Meditate' },
];

export function ActivityFilter({ value, onChange }: ActivityFilterProps): JSX.Element {
  return (
    <Flex gap="2" wrap="wrap">
      {filterOptions.map((option) => (
        <Button
          key={option.value}
          size="2"
          variant={value === option.value ? 'solid' : 'soft'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </Flex>
  );
}

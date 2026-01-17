import { Flex, Text, Box, Checkbox } from '@radix-ui/themes';
import type { DayOfWeek } from '@lifting/shared';

const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const DAY_ABBREVIATIONS: Record<DayOfWeek, string> = {
  0: 'S',
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'T',
  5: 'F',
  6: 'S',
};

interface DaySelectorProps {
  selectedDays: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
  disabled?: boolean;
}

export function DaySelector({
  selectedDays,
  onChange,
  disabled = false,
}: DaySelectorProps): JSX.Element {
  const handleToggle = (day: DayOfWeek): void => {
    if (selectedDays.includes(day)) {
      onChange(selectedDays.filter((d) => d !== day));
    } else {
      onChange([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  return (
    <Flex gap="2" wrap="wrap" data-testid="day-selector">
      {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) => (
        <Box key={day}>
          <Text
            as="label"
            size="2"
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            <Flex
              direction="column"
              align="center"
              gap="1"
              p="2"
              style={{
                backgroundColor: selectedDays.includes(day)
                  ? 'var(--accent-3)'
                  : 'var(--gray-2)',
                borderRadius: 'var(--radius-2)',
                border: selectedDays.includes(day)
                  ? '2px solid var(--accent-8)'
                  : '2px solid transparent',
                minWidth: '48px',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Checkbox
                checked={selectedDays.includes(day)}
                onCheckedChange={() => handleToggle(day)}
                disabled={disabled}
                data-testid={`day-checkbox-${day}`}
              />
              <Text
                size="1"
                weight="medium"
                title={DAY_NAMES[day]}
                color={selectedDays.includes(day) ? undefined : 'gray'}
              >
                {DAY_ABBREVIATIONS[day]}
              </Text>
              <Text
                size="1"
                color="gray"
                style={{ fontSize: '10px' }}
              >
                {DAY_NAMES[day].slice(0, 3)}
              </Text>
            </Flex>
          </Text>
        </Box>
      ))}
    </Flex>
  );
}

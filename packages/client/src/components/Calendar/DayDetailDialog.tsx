import { Dialog, Button, Flex, Text, Box, VisuallyHidden } from '@radix-ui/themes';
import { Cross2Icon } from '@radix-ui/react-icons';
import type { CalendarDayData, CalendarActivity } from '@brad-os/shared';
import { ActivityItem } from './ActivityItem';

interface DayDetailDialogProps {
  day: CalendarDayData | null;
  open: boolean;
  onClose: () => void;
  onActivityClick: (activity: CalendarActivity) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function DayDetailDialog({
  day,
  open,
  onClose,
  onActivityClick,
}: DayDetailDialogProps): JSX.Element | null {
  // Don't render dialog if day is null
  if (!day) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Content maxWidth="450px">
        <VisuallyHidden>
          <Dialog.Description>
            Activities for {formatDate(day.date)}
          </Dialog.Description>
        </VisuallyHidden>
        <Flex justify="between" align="center" mb="4">
          <Dialog.Title size="5" mb="0">
            {formatDate(day.date)}
          </Dialog.Title>
          <Dialog.Close>
            <Button variant="ghost" color="gray" aria-label="Close">
              <Cross2Icon />
            </Button>
          </Dialog.Close>
        </Flex>

        <Box>
          {day.activities.length === 0 ? (
            <Text color="gray" size="2">
              No activities on this day.
            </Text>
          ) : (
            <Flex direction="column" gap="2">
              {day.activities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  onClick={onActivityClick}
                />
              ))}
            </Flex>
          )}
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
}

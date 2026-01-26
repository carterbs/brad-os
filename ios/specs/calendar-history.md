# Calendar & History Feature

## Description

The Calendar & History feature provides users with a visual timeline of their completed activities across workouts, stretch sessions, and meditation practices. The feature consists of two main views: a basic Calendar view (`/calendar`) and an enhanced History view (`/history`) with activity filtering capabilities.

The calendar displays a monthly grid where each day shows colored activity indicators (dots) representing different activity types: blue for workouts, teal for stretches, and purple for meditations. When users click on any day, a detail dialog opens showing all activities completed on that date, with formatted summaries specific to each activity type.

The History view extends the Calendar view by adding activity type filters at the top, allowing users to focus on specific activity types. Filtering updates both the visible activity dots on the calendar and the activities shown in day detail dialogs. From the day detail dialog, users can click on workout activities to navigate to the detailed workout view page, and click on stretch activities to navigate to the stretch session detail page. Meditation activities close the dialog without navigation since they don't have additional details to display.

## Requirements

### Calendar Display

```gherkin
Feature: Monthly Calendar View

  Scenario: Display current month on load
    Given the user navigates to the calendar page
    When the page loads
    Then the calendar should display the current month and year
    And the calendar grid should show all days of the month

  Scenario: Navigate to previous month
    Given the user is viewing the calendar for the current month
    When the user clicks the "< Prev" button
    Then the calendar should display the previous month
    And calendar data for the new month should be fetched

  Scenario: Navigate to next month
    Given the user is viewing the calendar for the current month
    When the user clicks the "Next >" button
    Then the calendar should display the next month

  Scenario: Loading state during data fetch
    Given the user navigates to the calendar page
    When calendar data is being fetched
    Then a loading spinner should be displayed

  Scenario: Error state when data fetch fails
    Given the user navigates to the calendar page
    When the calendar data fetch fails
    Then an error message should be displayed
```

### Activity Indicators

```gherkin
Feature: Activity Dots on Calendar

  Scenario: Display workout indicator
    Given a workout was completed on January 15th
    When the user views the calendar for January
    Then a blue dot should appear on the 15th day tile

  Scenario: Display stretch indicator
    Given a stretch session was completed on January 15th
    When the user views the calendar for January
    Then a teal dot should appear on the 15th day tile

  Scenario: Display meditation indicator
    Given a meditation session was completed on January 15th
    When the user views the calendar for January
    Then a purple dot should appear on the 15th day tile

  Scenario: Display multiple activity indicators on same day
    Given a workout, stretch, and meditation were all completed on January 15th
    When the user views the calendar for January
    Then all three dots (blue, teal, purple) should appear on the 15th
    And the dots should be horizontally aligned with 2px gap

  Scenario: No indicators on days without activities
    Given no activities were completed on January 20th
    When the user views the calendar for January
    Then the 20th day tile should have no activity dots
```

### Day Detail Dialog

```gherkin
Feature: Day Activity Details

  Scenario: Open day detail dialog by clicking a day
    Given the user is viewing the calendar
    When the user clicks on any day tile
    Then a dialog should open
    And the dialog title should show the formatted date

  Scenario: Close day detail dialog with close button
    Given the day detail dialog is open
    When the user clicks the "X" close button
    Then the dialog should close

  Scenario: Display empty day message
    Given no activities were completed on January 20th
    When the user clicks on the 20th day
    Then the message "No activities on this day." should be displayed

  Scenario: Display single workout activity
    Given a "Push Day" workout was completed on January 15th
    When the user clicks on the 15th day
    Then the item should have a blue "Workout" badge
    And the summary should show "Push Day - 5 exercises"

  Scenario: Display single stretch activity
    Given a stretch session lasting 15 minutes with 3 regions was completed
    When the user clicks on that day
    Then the item should have a teal "Stretch" badge
    And the summary should show "3 regions - 15 min"

  Scenario: Display single meditation activity
    Given a 20-minute meditation was completed
    When the user clicks on that day
    Then the item should have a purple "Meditation" badge
    And the summary should show "20 min"

  Scenario: Display multiple activities chronologically
    Given a workout, stretch, and meditation were completed on January 15th
    When the user clicks on the 15th day
    Then the dialog should show three activity items
    And the activities should be ordered by completion time
```

### Activity Item Interactions

```gherkin
Feature: Activity Item Navigation

  Scenario: Navigate to workout detail page
    Given the day detail dialog shows a workout activity
    When the user clicks on the workout activity item
    Then the app should navigate to "/lifting/workouts/{workoutId}"
    And the dialog should close

  Scenario: Navigate to stretch session detail page
    Given the day detail dialog shows a stretch activity
    When the user clicks on the stretch activity item
    Then the app should navigate to "/stretch-sessions/{sessionId}"
    And the dialog should close

  Scenario: Click meditation activity (no navigation)
    Given the day detail dialog shows a meditation activity
    When the user clicks on the meditation activity item
    Then the dialog should close
    And no navigation should occur
```

### Stretch Session Detail Page

```gherkin
Feature: Stretch Session Detail View

  Scenario: Display stretch session header
    Given the user navigates to "/stretch-sessions/{sessionId}"
    When the page loads
    Then the page should display the session date and time
    And the page should show total duration in minutes
    And the page should show the number of regions completed

  Scenario: Display stretch list
    Given a stretch session with 6 stretches was completed
    When the user views the session detail page
    Then all 6 stretches should be displayed in order
    And each stretch should show the body region name
    And each stretch should show the stretch name
    And each stretch should show the configured duration (60s or 120s)

  Scenario: Display skipped stretch indicator
    Given a stretch session where "Neck Forward Tilt" was skipped
    When the user views the session detail page
    Then the "Neck Forward Tilt" stretch should show a "Skipped" indicator
    And the skipped stretch should have muted styling

  Scenario: Display partially completed stretch
    Given a stretch session where one segment of "Shoulder Cross-Body" was skipped
    When the user views the session detail page
    Then the stretch should show "1/2 segments" indicator

  Scenario: Navigate back to history
    Given the user is viewing a stretch session detail page
    When the user clicks the back button
    Then the app should navigate back to the history page

  Scenario: Handle invalid session ID
    Given the user navigates to "/stretch-sessions/invalid-id"
    When the page loads
    Then an error message should be displayed
    And a link to return to history should be shown

  Scenario: Display session summary card
    Given a stretch session was completed
    When the user views the session detail page
    Then a summary card should show:
      | Field             | Example Value        |
      | Date              | January 15, 2026     |
      | Time              | 7:30 AM              |
      | Total Duration    | 12 min               |
      | Regions Completed | 4                    |
      | Regions Skipped   | 1                    |
```

### History Page with Filtering

```gherkin
Feature: Activity Type Filtering

  Scenario: Display all activity types by default
    Given the user navigates to the history page
    When the page loads
    Then the "All" filter button should be active
    And all activity dots should be visible on the calendar

  Scenario: Filter to show only workouts
    Given the user is viewing the history page with all activities
    When the user clicks the "Lifting" filter button
    Then only blue workout dots should appear on the calendar
    And day detail dialogs should only show workout activities

  Scenario: Filter to show only stretch sessions
    Given the user is viewing the history page
    When the user clicks the "Stretch" filter button
    Then only teal stretch dots should appear on the calendar

  Scenario: Filter to show only meditations
    Given the user is viewing the history page
    When the user clicks the "Meditate" filter button
    Then only purple meditation dots should appear on the calendar

  Scenario: Filter persists across month navigation
    Given the user has selected the "Lifting" filter
    When the user navigates to the next month
    Then the "Lifting" filter should remain active
    And only workout dots should appear in the new month

  Scenario: Reset filter to show all activities
    Given the user has an active filter
    When the user clicks the "All" filter button
    Then all activity types should be visible again
```

### Data Loading and Caching

```gherkin
Feature: Calendar Data Management

  Scenario: Fetch data for current month on load
    Given the user navigates to the calendar page
    When the page loads
    Then an API request should be made to "/api/calendar/{year}/{month}"
    And the request should include the browser's timezone offset

  Scenario: Cache calendar data for 5 minutes
    Given the user has loaded calendar data for January
    When the user navigates to another page
    And returns to the calendar within 5 minutes
    Then the cached data should be used
    And no new API request should be made

  Scenario: Handle timezone correctly
    Given the user is in EST timezone (offset +300 minutes)
    When calendar data is fetched
    Then the timezone offset should be sent in the query
    And activities should be grouped by local date
```

### API Response Structure

```gherkin
Feature: Calendar API Contract

  Scenario: Successful calendar data response
    Given a valid request to "/api/calendar/2026/1"
    When the server processes the request
    Then the response should have status 200
    And data.startDate should be "2026-01-01"
    And data.endDate should be "2026-01-31"
    And data.days should be an object keyed by date strings

  Scenario: Invalid year parameter
    When I request GET "/api/calendar/999/1"
    Then the API should return status 400
    And the error code should be "VALIDATION_ERROR"

  Scenario: Invalid month parameter
    When I request GET "/api/calendar/2026/13"
    Then the API should return status 400
```

### Visual Styling

```gherkin
Feature: Calendar Visual Presentation

  Scenario: Activity item background colors
    Given activity items are displayed in the day detail dialog
    Then workout items should have background "rgba(99, 102, 241, 0.15)"
    And stretch items should have background "rgba(20, 184, 166, 0.15)"
    And meditation items should have background "rgba(168, 85, 247, 0.15)"

  Scenario: Activity dot styling
    Given activity dots appear on the calendar
    Then each dot should be 6px width and height
    And each dot should be circular
    And multiple dots should have 2px gap between them

  Scenario: Filter button states
    Given activity filter buttons are displayed
    Then the active filter should use variant="solid"
    And inactive filters should use variant="soft"
```

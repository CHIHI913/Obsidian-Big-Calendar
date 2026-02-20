import React, {forwardRef, useCallback, useEffect, useMemo, useRef, memo, useState} from 'react';
import '@/less/Calendar.less';
import '@/less/time-select.less';
import '@/less/event-styles.less';
import '@/less/modal.less';
import {Calendar, Event, momentLocalizer, SlotInfo, View} from 'react-big-calendar';
import {moment} from 'obsidian';
import withDragAndDrop, {withDragAndDropProps} from 'react-big-calendar/lib/addons/dragAndDrop';
import dailyNotesService from '@/services/fileService';
import eventService from '@/services/eventService';
import globalService from '@/services/globalService';
import useFileStore from '@/stores/fileStore';
import useCalendarStore from '@/stores/calendarStore';
import EventCreatePrompt, {EventCreateResult} from '@/obComponents/EventCreatePrompt';
import {useEvents} from '@/hooks/useStore';
import useEventStore from '@/stores/eventStore';
import locationService from '@/services/locationService';
// Import our custom toolbar
import CustomToolbar from './CustomToolbar';
// Import our custom event component
import EventComponent from './EventComponent';
// Import our filter component
import FilterComponent from './FilterComponent';
// Import folder filter component
import FolderFilter from './FolderFilter';
import {useView} from '@/hooks/useView';
import {t} from '@/translations/helper';

export interface EventRefActions {
  updateEvents: (events: Model.Event[]) => void;
}

interface CalendarProps {
  selectable: boolean;
  resizeable: boolean;
  defaultView: View;
  StartDate: string;
  popup: boolean;
  onEventDoubleClick: (event: Event) => void;
  onEventSelect: (event: EventCreateResult, slotInfo: SlotInfo) => void;
}

// Create a memoized DragAndDropCalendar component
const DragAndDropCalendar = memo(withDragAndDrop(Calendar as any));

const isWeekend = (day: number) => day === 0 || day === 6;

// eslint-disable-next-line react/display-name
const CalendarComponent = forwardRef((props: CalendarProps, ref: React.ForwardedRef<EventRefActions>) => {
  const {
    selectable,
    resizeable,
    defaultView,
    StartDate,
    popup,
    onEventDoubleClick: handleDoubleClickEventCallback,
    onEventSelect: handleEventSelectCallback,
  } = props;

  // State to manage loading state when filters change
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get app from fileStore
  const app = useFileStore((state) => state.app);

  const events = useEvents();
  // Get state and actions from the calendar store
  const {
    calendarView,
    calendarDate,
    selectable: select,
    resizable: resize,
    calendarPopup,
    setCalendarView,
    setCalendarDate,
    setSelectable,
    setResizable,
    setCalendarPopup,
    setStartDay,
    setLoading,
    loadStoredPreferences,
    saveCalendarView,
    saveCalendarDate,
    hideWeekends,
  } = useCalendarStore();

  // Create a memoized localizer
  const localizer = useMemo(() => momentLocalizer(moment), []);

  // Compute effective view (work_week when hiding weekends in week view)
  const effectiveView = useMemo(() => {
    if (hideWeekends && calendarView === 'week') {
      return 'work_week' as View;
    }
    return calendarView;
  }, [hideWeekends, calendarView]);

  // Filter events for agenda view when hiding weekends
  const filteredEvents = useMemo(() => {
    if (hideWeekends && calendarView === 'agenda') {
      return events.filter((event: any) => {
        const day = new Date(event.start).getDay();
        return day !== 0 && day !== 6;
      });
    }
    return events;
  }, [events, hideWeekends, calendarView]);

  // Load events when the component mounts or when the app changes
  useEffect(() => {
    const fetchEvents = async () => {
      if (app) {
        setIsLoading(true);
        try {
          // Fetch all events
          await eventService.fetchAllEvents(app);

          // Apply current filters after loading events
          const query = locationService.getState().query;
          if (query) {
            const filterCriteria: Model.EventFilter = {
              eventType: query.eventType || undefined,
              contentRegex: query.contentRegex || undefined,
              folderPaths: query.folderPaths?.length > 0 ? query.folderPaths : undefined,
              // Add any other filter criteria from query
              contentText: query.text || '',
            };

            // Apply filtering
            eventService.filterEvents(filterCriteria);
          }
        } catch (error) {
          console.error('Error loading events:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchEvents();
  }, [app]);

  // Initialize the component - Only run once when app is available
  useEffect(() => {
    if (!app) return;

    // Use a timeout to defer these operations, breaking potential circular dependencies
    const timeoutId = setTimeout(() => {
      // Load stored preferences
      loadStoredPreferences(app);

      // Set initial values from props if they don't match stored values
      if (defaultView && defaultView !== calendarView) {
        setCalendarView(defaultView);
      }

      if (selectable !== select) {
        setSelectable(selectable);
      }

      if (resizeable !== resize) {
        setResizable(resizeable);
      }

      if (popup !== calendarPopup) {
        setCalendarPopup(popup);
      }

      // Set start day and update moment locale
      setStartDay(StartDate === 'sunday' ? 'sunday' : 'monday');

      // Mark loading as complete
      setLoading(false);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [
    app,
    defaultView,
    calendarView,
    selectable,
    select,
    resizeable,
    resize,
    popup,
    calendarPopup,
    StartDate,
    loadStoredPreferences,
    setCalendarView,
    setSelectable,
    setResizable,
    setCalendarPopup,
    setStartDay,
    setLoading,
  ]);

  // Handle filter changes - reload events only if metadata filters change
  const handleFilterChange = useCallback(
    async (filterType: 'metadata' | 'client') => {
      if (!app) return;

      // Only reload data from files if metadata filters have changed
      if (filterType === 'metadata') {
        setIsRefreshing(true);
        try {
          await eventService.fetchAllEvents(app);

          // After fetching all events, apply filters
          const query = locationService.getState().query;
          const filterCriteria: Model.EventFilter = {
            eventType: query.eventType || undefined,
            contentRegex: query.contentRegex || undefined,
            folderPaths: query.folderPaths?.length > 0 ? query.folderPaths : undefined,
            contentText: query.text || '',
          };

          // Apply filtering
          eventService.filterEvents(filterCriteria);
        } catch (error) {
          console.error('Error refreshing events:', error);
        } finally {
          setIsRefreshing(false);
        }
      } else {
        // For client-side filtering, just apply filters to existing events
        const query = locationService.getState().query;
        const filterCriteria: Model.EventFilter = {
          eventType: query.eventType || undefined,
          contentRegex: query.contentRegex || undefined,
          folderPaths: query.folderPaths?.length > 0 ? query.folderPaths : undefined,
          contentText: query.text || '',
        };

        // Apply filtering
        eventService.filterEvents(filterCriteria);

        // Trigger re-render
        useEventStore.getState().setForceUpdate();
      }
    },
    [app],
  );

  // Style events based on their type and extra folder color
  const styleEvents = useCallback((event: any) => {
    const className = event.eventType;
    const style: React.CSSProperties = {};

    // Check if this event belongs to an ExtraFolder and apply its color
    if (event.path) {
      const settings = globalService.getState().pluginSetting;
      const matchingFolder = settings.ExtraFolders?.find((f: any) => event.path.startsWith(f.path + '/'));
      if (matchingFolder?.color) {
        (style as any)['--event-folder-color'] = matchingFolder.color;
      }
    }

    return {className, style};
  }, []);

  // Handle double click on events
  const handleDoubleClickEvent = useCallback(
    (event: Event) => {
      handleDoubleClickEventCallback(event);
    },
    [handleDoubleClickEventCallback],
  );

  // Handle event selection
  const handleEventSelect = useCallback(
    async (slotInfo: SlotInfo) => {
      const {app} = dailyNotesService.getState();

      // Pass the start and end times from slotInfo to EventCreatePrompt
      const addEvent = await EventCreatePrompt.Prompt(
        app,
        'Input Event',
        '',
        '',
        slotInfo.start as Date,
        slotInfo.end as Date,
      );

      handleEventSelectCallback(addEvent, slotInfo);
    },
    [handleEventSelectCallback],
  );

  // Handle view changes
  const handleViewChange = useCallback(
    (view: View) => {
      const storeView = view === 'work_week' ? ('week' as View) : view;
      if (calendarView !== storeView) {
        setCalendarView(storeView);
        // Save the view change to storage
        if (app) {
          setTimeout(() => {
            saveCalendarView(app);
          }, 0);
        }
      }
    },
    [calendarView, setCalendarView, app, saveCalendarView],
  );

  // Handle navigation (date changes)
  const handleNavigate = useCallback(
    (date: Date) => {
      let targetDate = date;

      // Skip weekends in day view when hideWeekends is on
      if (hideWeekends && calendarView === 'day') {
        const day = date.getDay();
        if (day === 0 || day === 6) {
          const isForward = date.getTime() > calendarDate.getTime();
          targetDate = new Date(date);
          if (isForward) {
            targetDate.setDate(date.getDate() + (day === 6 ? 2 : 1));
          } else {
            targetDate.setDate(date.getDate() - (day === 0 ? 2 : 1));
          }
        }
      }

      if (calendarDate.getTime() !== targetDate.getTime()) {
        setCalendarDate(targetDate);

        // Save the date change to storage
        if (app) {
          setTimeout(() => {
            saveCalendarDate(app);
          }, 0);
        }
      }
    },
    [calendarDate, setCalendarDate, app, saveCalendarDate, hideWeekends, calendarView],
  );

  // Handle event resize - Memoize the implementation
  const onEventResize = useCallback<withDragAndDropProps['onEventResize']>((data) => {
    const {event, start, end} = data;

    eventService
      .editEvent(event as Model.Event, start, end)
      .then((updatedEvent) => {
        if (updatedEvent) {
          console.log('Event resized successfully:', updatedEvent.id);
        } else {
          console.error('Failed to resize event');
        }
      })
      .catch((error) => {
        console.error('Error resizing event:', error);
      });
  }, []);

  // Handle event drop - Memoize the implementation
  const onEventDrop = useCallback<withDragAndDropProps['onEventDrop']>((data) => {
    const {event, start, end} = data;

    eventService
      .editEvent(event as Model.Event, start, end)
      .then((updatedEvent) => {
        if (updatedEvent) {
          console.log('Event updated successfully:', updatedEvent.id);
        } else {
          console.error('Failed to update event');
        }
      })
      .catch((error) => {
        console.error('Error updating event:', error);
      });
  }, []);

  // Memoize calendar props to prevent unnecessary re-renders
  const calendarProps = useMemo(() => {
    return {
      selectable: select,
      localizer: localizer,
      events: filteredEvents,
      resizable: resize,
      defaultView: calendarView,
      defaultDate: calendarDate,
      date: calendarDate,
      view: effectiveView,
      views: hideWeekends
        ? {month: true, week: true, work_week: true, day: true, agenda: true}
        : {month: true, week: true, day: true, agenda: true},
      eventPropGetter: styleEvents,
      popup: calendarPopup,
      onEventDrop: onEventDrop,
      onEventResize: onEventResize,
      titleAccessor: (event: any) => {
        // Remove time patterns from the title for display
        const title = event.title as string;
        const cleanedTitle = title
          .replace(/\d{1,2}:\d{2}(\s?-\s?\d{1,2}:\d{2})?/g, '') // Remove time ranges like 10:00-11:00 or 10:00 - 11:00
          .replace(/⏲\s?\d{1,2}:\d{2}/g, '') // Remove end time emoji patterns
          .replace(/📅\s?\d{4}-\d{2}-\d{2}/g, '') // Remove date patterns
          .trim();

        // Return original title if cleaned version is empty
        return cleanedTitle || title;
      },
      tooltipAccessor: (event: any) => event.title as string,
      onView: handleViewChange,
      onNavigate: handleNavigate,
      onDoubleClickEvent: handleDoubleClickEvent,
      onSelectSlot: handleEventSelect,
      // Add custom components configuration
      components: {
        toolbar: CustomToolbar,
        event: EventComponent,
      },
    };
  }, [
    select,
    localizer,
    filteredEvents,
    calendarDate,
    resize,
    calendarView,
    effectiveView,
    hideWeekends,
    styleEvents,
    calendarPopup,
    onEventDrop,
    onEventResize,
    handleViewChange,
    handleNavigate,
    handleDoubleClickEvent,
    handleEventSelect,
  ]);

  const containerClassName = `calendar-container${hideWeekends ? ' hide-weekends' : ''}${
    moment.localeData().firstDayOfWeek() === 1 ? ' start-monday' : ' start-sunday'
  }`;

  return (
    <div ref={containerRef} className={containerClassName}>
      <div className="calendar-filters">
        <FilterComponent onFilterChange={handleFilterChange} />
        {(isRefreshing || isLoading) && (
          <div className="filter-refreshing">{isLoading ? 'Loading events...' : 'Refreshing events...'}</div>
        )}
      </div>
      <FolderFilter onFilterChange={handleFilterChange} />
      <DragAndDropCalendar {...calendarProps} />
    </div>
  );
});

export default memo(CalendarComponent);

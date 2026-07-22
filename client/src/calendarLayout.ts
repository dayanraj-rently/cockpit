// Shared pixel/time constants between WeekCalendar and WorklogBlock so their
// position math (and cross-day drag delta math) stays in agreement.
export const VISIBLE_START_HOUR = 0;
export const VISIBLE_END_HOUR = 24;
export const PX_PER_HOUR = 64;
export const SNAP_MINUTES = 15;
export const MIN_BLOCK_HEIGHT_PX = 20;
export const MIN_DURATION_MS = 30 * 60 * 1000;
export const GRID_HEIGHT_PX = (VISIBLE_END_HOUR - VISIBLE_START_HOUR) * PX_PER_HOUR;
export const TIME_AXIS_WIDTH_PX = 56;

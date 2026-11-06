// Dates and times shown in the gym's time zone, whatever the phone's own is.
export const GYM_TIME_ZONE = "Asia/Kolkata";

// "2026-11-07": the gym-local calendar day of a timestamp, for grouping.
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: GYM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const dayKey = (date) => dayKeyFormat.format(new Date(date));

const weekdayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: GYM_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
});
const shortDayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: GYM_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: GYM_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// "Today", "Tomorrow", or "Saturday, 8 Nov", for a day group heading.
export function dayHeading(date, now = new Date()) {
  const key = dayKey(date);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now.getTime() + 24 * 60 * 60 * 1000)) return "Tomorrow";
  return weekdayFormat.format(new Date(date));
}

// "7:00 am"
export const timeOfDay = (date) => timeFormat.format(new Date(date));

// "Today, 7:00 am" / "Sat, 8 Nov, 6:30 pm" for a single line.
export function dayAndTime(date, now = new Date()) {
  const heading = dayHeading(date, now);
  const day = heading === "Today" || heading === "Tomorrow" ? heading : shortDayFormat.format(new Date(date));
  return `${day}, ${timeOfDay(date)}`;
}

// 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd"
export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

const longDateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: GYM_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// "2026-11-07" (a gym-local calendar day, as the server sends it) ->
// "Saturday, 7 November 2026". Midday India time, so it's the same day
// whatever the phone's own time zone.
export const longDate = (isoDay) => longDateFormat.format(new Date(`${isoDay}T12:00:00+05:30`));

// <input type="datetime-local"> values are gym-local (India) wall-clock times.
// "2026-11-08T07:00" -> "2026-11-08T07:00:00+05:30", or null if it isn't one.
export function gymInputToIso(value) {
  const m = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/);
  if (!m) return null;
  const iso = `${m[1]}${m[2] ?? ":00"}+05:30`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

const inputPartsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: GYM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// The gym-local time now, in datetime-local format ("2026-11-07T18:45"), for
// the input's min.
export function gymInputNow(date = new Date()) {
  const p = Object.fromEntries(inputPartsFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// [{ key, heading, items }] in the given order, by gym-local day of getDate(item).
export function groupByDay(items, getDate) {
  const groups = [];
  for (const item of items) {
    const key = dayKey(getDate(item));
    if (groups.at(-1)?.key !== key) groups.push({ key, heading: dayHeading(getDate(item)), items: [] });
    groups.at(-1).items.push(item);
  }
  return groups;
}

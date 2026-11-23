// How a class's timetable reads: "Mon & Wed, 18:00 (60 min)".
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (sorted.length === 7) return "Every day";
  if (sorted.join() === "1,2,3,4,5") return "Weekdays";
  const names = sorted.map((d) => SHORT[d]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "");
}

export function timetableLabel(c: { weekdays: number[]; start_time: string; duration_minutes: number }): string {
  return `${weekdaysLabel(c.weekdays)}, ${c.start_time.slice(0, 5)} (${c.duration_minutes} min)`;
}

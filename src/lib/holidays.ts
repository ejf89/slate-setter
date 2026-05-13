export interface HolidayMarker {
  weekendDate: string;
  label: string;
  emoji: string;
}

// Returns holiday labels for weekends that fall near major US holidays
export function getHolidayLabel(dateStr: string): { label: string; emoji: string } | null {
  const date = new Date(dateStr + "T12:00:00Z");
  const month = date.getUTCMonth() + 1; // 1-12
  const day = date.getUTCDate();

  // Christmas / New Year's (Dec 18 – Jan 1)
  if ((month === 12 && day >= 18) || (month === 1 && day <= 2))
    return { label: "Christmas", emoji: "🎄" };

  // Thanksgiving (Nov 21–30)
  if (month === 11 && day >= 21 && day <= 30)
    return { label: "Thanksgiving", emoji: "🦃" };

  // Valentine's Day (Feb 8–16)
  if (month === 2 && day >= 8 && day <= 16)
    return { label: "Valentine's", emoji: "💗" };

  // Memorial Day (May 23–31)
  if (month === 5 && day >= 23)
    return { label: "Memorial Day", emoji: "🇺🇸" };

  // July 4th (Jun 30 – Jul 7)
  if ((month === 7 && day <= 7) || (month === 6 && day >= 30))
    return { label: "July 4th", emoji: "🎆" };

  // Labor Day (Aug 30 – Sep 7)
  if ((month === 8 && day >= 30) || (month === 9 && day <= 7))
    return { label: "Labor Day", emoji: "🛠️" };

  // MLK Weekend (Jan 12–21)
  if (month === 1 && day >= 12 && day <= 21)
    return { label: "MLK Weekend", emoji: "✊" };

  // Halloween (Oct 25–31)
  if (month === 10 && day >= 25)
    return { label: "Halloween", emoji: "🎃" };

  // Easter / Spring break (late March–mid April — approximate)
  if (month === 3 && day >= 25)
    return { label: "Easter", emoji: "🐣" };
  if (month === 4 && day <= 10)
    return { label: "Spring Break", emoji: "🌸" };

  return null;
}

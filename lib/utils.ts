/**
 * Returns the current date in YYYY-MM-DD format based on local time.
 */
export function getLocalDate(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string into a Date object in local time (midnight).
 * Solves the issue where new Date("YYYY-MM-DD") uses UTC.
 */
export function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

import { DateTime } from "luxon";

export function formatIsoLocalDatetime(d: Date): string {
	return DateTime.fromJSDate(d).toFormat("yyyy-LL-dd HH:mm");
}

export function parseIsoLocalDatetime(value: string): Date | null {
	const input = value.trim();
	if (!input) return null;
	// Accept both "YYYY-MM-DDTHH:mm" and "YYYY-MM-DD HH:mm" (and optional seconds).
	const normalized = input.replace(" ", "T");
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized))
		return null;

	const dt = DateTime.fromISO(normalized, { zone: "local" });
	if (!dt.isValid) return null;
	return dt.toJSDate();
}

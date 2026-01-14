import { DateTime } from "luxon";

export function formatIsoLocalDatetime(d: Date): string {
	const out = DateTime.fromJSDate(d).toISO({
		suppressSeconds: true,
		suppressMilliseconds: true,
		includeOffset: false,
	});
	return out ?? "";
}

export function parseIsoLocalDatetime(value: string): Date | null {
	const input = value.trim();
	// Enforce the exact UI format we display.
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;

	const dt = DateTime.fromISO(input, { zone: "local" });
	if (!dt.isValid) return null;
	return dt.toJSDate();
}

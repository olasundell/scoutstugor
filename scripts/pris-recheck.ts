import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Args = {
	olderThanDays?: number;
	missingOnly?: boolean;
	json?: boolean;
};

function parseArgs(argv: string[]): Args {
	const args: Args = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--missing-only") {
			args.missingOnly = true;
			continue;
		}
		if (a === "--json") {
			args.json = true;
			continue;
		}
		if (a === "--older-than-days") {
			const v = argv[i + 1];
			if (!v) throw new Error("--older-than-days kräver ett tal.");
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n) || n < 0)
				throw new Error("Ogiltigt tal för --older-than-days.");
			args.olderThanDays = n;
			i++;
			continue;
		}
		throw new Error(`Okänd flagga: ${a}`);
	}
	return args;
}

function isoDateOnly(d: Date): string {
	// YYYY-MM-DD
	return d.toISOString().slice(0, 10);
}

function daysSince(isoDate: string, now: Date): number | null {
	// Accept YYYY-MM-DD (preferred). If parsing fails, return null.
	const t = Date.parse(isoDate);
	if (!Number.isFinite(t)) return null;
	const diffMs = now.getTime() - t;
	return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

const args = parseArgs(process.argv.slice(2));
const now = new Date();

const JSON_PATH = resolve(process.cwd(), "data/scoutstugor.stockholm.json");
const jsonText = await readFile(JSON_PATH, { encoding: "utf8" });
const raw = JSON.parse(jsonText) as unknown;
if (!Array.isArray(raw)) throw new Error("JSON måste vara en array.");

const items = (raw as unknown[])
	.map((value) => {
		const x = (value ?? {}) as Record<string, unknown>;
		return {
			id: typeof x.id === "string" ? x.id : "",
			kommun: typeof x.kommun === "string" ? x.kommun : "",
			namn: typeof x.namn === "string" ? x.namn : "",
			typ: typeof x.typ === "string" ? x.typ : "",
			senastKontrollerad:
				typeof x.senastKontrollerad === "string"
					? x.senastKontrollerad
					: undefined,
			prisinfo: typeof x.prisinfo === "string" ? x.prisinfo : undefined,
			prisKallaUrl:
				typeof x.prisKallaUrl === "string" ? x.prisKallaUrl : undefined,
			prisKallaNotering:
				typeof x.prisKallaNotering === "string"
					? x.prisKallaNotering
					: undefined,
			bokningslank:
				typeof x.bokningslank === "string" ? x.bokningslank : undefined,
			bokningsKallaUrl:
				typeof x.bokningsKallaUrl === "string" ? x.bokningsKallaUrl : undefined,
			bokningsKallaNotering:
				typeof x.bokningsKallaNotering === "string"
					? x.bokningsKallaNotering
					: undefined,
		};
	})
	.map((x) => ({
		...x,
		daysSinceKontroll: x.senastKontrollerad
			? daysSince(x.senastKontrollerad, now)
			: null,
	}))
	.filter((x) => {
		if (args.missingOnly) return !x.prisinfo || !x.prisKallaUrl;
		return Boolean(x.prisKallaUrl || x.bokningslank || x.bokningsKallaUrl);
	})
	.filter((x) => {
		if (args.olderThanDays === undefined) return true;
		if (!x.senastKontrollerad) return true;
		if (x.daysSinceKontroll === null) return true;
		return x.daysSinceKontroll >= args.olderThanDays;
	})
	.sort((a, b) => {
		const ad = a.senastKontrollerad ?? "";
		const bd = b.senastKontrollerad ?? "";
		return ad.localeCompare(bd, "sv");
	});

if (args.json) {
	console.log(
		JSON.stringify(
			{
				generatedAt: now.toISOString(),
				today: isoDateOnly(now),
				count: items.length,
				items,
			},
			null,
			2,
		),
	);
	process.exit(0);
}

// Markdown output (easy to paste into issues/docs)
console.log(`Generated: ${now.toISOString()}`);
console.log(`Today: ${isoDateOnly(now)}`);
console.log(`Count: ${items.length}`);
console.log("");
console.log(
	[
		"| id | kommun | namn | senastKontrollerad | dagar | prisKallaUrl | prisKallaNotering |",
		"|---|---|---|---:|---:|---|---|",
		...items.map((x) => {
			const url = x.prisKallaUrl ?? "";
			const note = (x.prisKallaNotering ?? "").replace(/\n+/g, " ").trim();
			const days = x.daysSinceKontroll ?? "";
			const date = x.senastKontrollerad ?? "";
			return `| ${x.id} | ${x.kommun} | ${x.namn} | ${date} | ${days} | ${url} | ${note} |`;
		}),
	].join("\n"),
);

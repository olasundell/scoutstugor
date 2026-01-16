import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_URL = "https://scoutstuga.se";
const OUTPUT_PATH = resolve(
	process.cwd(),
	"data",
	"scoutstugor.sverige.json",
);
const CONFLICT_REPORT_PATH = resolve(
	process.cwd(),
	"data",
	"import-scoutstuga-conflicts.json",
);
const RESOLUTION_PATH = resolve(
	process.cwd(),
	"data",
	"import-scoutstuga-resolutions.json",
);
const EXCLUDE_REGION = 11; // Stockholms län
const INCLUDE_STOCKHOLM = process.argv.includes("--include-stockholm");
const SKIP_GEOCODE = process.argv.includes("--skip-geocode");
const APPLY_CHANGES = process.argv.includes("--apply");

const GEOCODE_SLEEP_MS = 1100;
const NOMINATIM_USER_AGENT = "scoutstuga-data-import/1.0";

const typeLabelMap = {
	Scoutcabin: "Scoutstuga",
	Scoutrooms: "Scoutlokal",
	Campsite: "Lägerplats",
	Windshelter: "Vindskydd",
};

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSuffix(value, suffixes) {
	let out = value.trim();
	for (const suffix of suffixes) {
		if (out.endsWith(suffix)) {
			out = out.slice(0, -suffix.length).trim();
		}
	}
	return out;
}

function decodeEscapes(value) {
	return value
		.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		)
		.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);
}

function extractEnumSnippet(js, marker) {
	const markerIndex = js.indexOf(marker);
	if (markerIndex === -1) {
		throw new Error(`Hittade inte enum-markören: ${marker}`);
	}
	const startIndex = js.lastIndexOf("function(e){return", markerIndex);
	const endIndex = js.indexOf("}({})", markerIndex);
	if (startIndex === -1 || endIndex === -1) {
		throw new Error(`Hittade inte enum-snippet för markör: ${marker}`);
	}
	return js.slice(startIndex, endIndex);
}

function parseEnumMapping(snippet) {
	const map = new Map();
	const chunks = snippet.split("e[e");
	for (const chunk of chunks) {
		const idMatch = chunk.match(/=(\d+)/);
		const labelMatch = chunk.match(/\]=\"([^\"]+)\"/);
		if (!idMatch || !labelMatch) continue;
		const id = Number(idMatch[1]);
		const label = decodeEscapes(labelMatch[1]);
		map.set(id, label);
	}
	return map;
}

async function fetchScoutstugaBundle() {
	const html = await fetch(BASE_URL).then((res) => res.text());
	const scriptMatch = html.match(/\/static\/js\/main\.[^"']+\.js/);
	if (!scriptMatch) {
		throw new Error("Kunde inte hitta JS-bundlen för scoutstuga.se.");
	}
	const jsUrl = new URL(scriptMatch[0], BASE_URL).toString();
	const js = await fetch(jsUrl).then((res) => res.text());

	const endpointMatch = js.match(/REACT_APP_COSMOSDB_ENDPOINT:"([^"]+)"/);
	const keyMatch = js.match(/REACT_APP_COSMOSDB_KEY:"([^"]+)"/);
	if (!endpointMatch || !keyMatch) {
		throw new Error("Kunde inte hitta Cosmos DB-konfigurationen i bundlen.");
	}

	return {
		endpoint: endpointMatch[1].replace(/\/$/, ""),
		key: keyMatch[1],
		js,
	};
}

function buildCosmosAuth(key, method, resourceType, resourceLink, date) {
	const verb = method.toLowerCase();
	const payload = `${verb}\n${resourceType}\n${resourceLink}\n${date.toLowerCase()}\n\n`;
	const signature = createHmac("sha256", Buffer.from(key, "base64"))
		.update(payload, "utf8")
		.digest("base64");
	return encodeURIComponent(`type=master&ver=1.0&sig=${signature}`);
}

async function queryCosmosDocs(endpoint, key, query) {
	const resourceLink = "dbs/scoutstuga/colls/accommodations";
	const docs = [];
	let continuation = null;

	do {
		const date = new Date().toUTCString();
		const auth = buildCosmosAuth(key, "post", "docs", resourceLink, date);
		const response = await fetch(`${endpoint}/${resourceLink}/docs`, {
			method: "POST",
			headers: {
				Authorization: auth,
				"x-ms-date": date,
				"x-ms-version": "2018-12-31",
				"x-ms-documentdb-isquery": "true",
				"x-ms-documentdb-partitionkeyrangeid": "0",
				"x-ms-max-item-count": "100",
				"Content-Type": "application/query+json",
				Accept: "application/json",
				...(continuation ? { "x-ms-continuation": continuation } : {}),
			},
			body: JSON.stringify({ query }),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Cosmos-fråga misslyckades: ${response.status} ${text}`);
		}

		const data = await response.json();
		const batch = data.Documents ?? [];
		docs.push(...batch);
		continuation = response.headers.get("x-ms-continuation");
	} while (continuation);

	return docs;
}

async function reverseGeocode(lat, lon) {
	const url = new URL("https://nominatim.openstreetmap.org/reverse");
	url.searchParams.set("format", "jsonv2");
	url.searchParams.set("accept-language", "sv");
	url.searchParams.set("lat", lat.toString());
	url.searchParams.set("lon", lon.toString());
	url.searchParams.set("addressdetails", "1");
	url.searchParams.set("zoom", "18");

	const response = await fetch(url, {
		headers: {
			"User-Agent": NOMINATIM_USER_AGENT,
		},
	});

	if (!response.ok) {
		throw new Error(
			`Nominatim svarade ${response.status} för ${lat}, ${lon}`,
		);
	}

	const payload = await response.json();
	return payload.address ?? {};
}

function formatKommun(address, fallback) {
	const raw =
		address.municipality ??
		address.city ??
		address.town ??
		address.village ??
		address.hamlet ??
		address.county ??
		fallback;
	return normalizeSuffix(raw, [" kommun", " län"]);
}

function formatPlatsAdress(address, kommun) {
	const road = address.road ?? address.path ?? address.pedestrian;
	const street = [road, address.house_number].filter(Boolean).join(" ").trim();
	const locality =
		address.isolated_dwelling ??
		address.hamlet ??
		address.village ??
		address.town ??
		address.city ??
		address.municipality;
	const postal = [address.postcode, locality].filter(Boolean).join(" ").trim();

	const parts = [];
	if (street) parts.push(street);
	if (postal) {
		parts.push(postal);
	} else if (locality) {
		parts.push(locality);
	}

	if (parts.length === 0 && kommun) {
		parts.push(kommun);
	}

	return parts.join(", ");
}

function buildOvrigt(doc) {
	const parts = [doc.description, doc.surroundings, doc.route]
		.map((value) => (value ?? "").trim())
		.filter(Boolean);

	return parts.join("\n\n");
}

async function readJsonIfExists(path) {
	try {
		const raw = await readFile(path, "utf8");
		return JSON.parse(raw);
	} catch (error) {
		if (error && error.code === "ENOENT") return null;
		throw error;
	}
}

function stableStringify(value) {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	const keys = Object.keys(value).sort();
	return `{${keys
		.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
		.join(",")}}`;
}

function diffFields(existing, incoming) {
	const keys = new Set([
		...Object.keys(existing ?? {}),
		...Object.keys(incoming ?? {}),
	]);
	const diffs = [];
	for (const key of keys) {
		const left = existing?.[key];
		const right = incoming?.[key];
		if (stableStringify(left) !== stableStringify(right)) {
			diffs.push({ key, existing: left, incoming: right });
		}
	}
	return diffs;
}

const { endpoint, key, js } = await fetchScoutstugaBundle();

const regionSnippet = extractEnumSnippet(js, 'e.Blekinge=0]="Blekinge"');
const typeSnippet = extractEnumSnippet(js, 'e.Scoutcabin=0]="Scoutcabin"');
const regionMap = parseEnumMapping(regionSnippet);
const typeMap = parseEnumMapping(typeSnippet);

const docs = await queryCosmosDocs(endpoint, key, "SELECT * FROM accommodations");
const filtered = docs.filter((doc) => {
	if (!doc.approved || doc.deactivated) return false;
	if (!INCLUDE_STOCKHOLM && doc.region === EXCLUDE_REGION) return false;
	return true;
});

const geocodeCache = new Map();
const items = [];
const today = new Date().toISOString().slice(0, 10);

for (const doc of filtered) {
	const regionLabelRaw = regionMap.get(doc.region ?? -1) ?? "Okänd region";
	const regionLabel = regionLabelRaw.replace(/_/g, " ");
	const lat =
		typeof doc.location?.lat === "number" ? doc.location.lat : null;
	const lon =
		typeof doc.location?.lng === "number" ? doc.location.lng : null;

	let kommun = regionLabel;
	let platsAdress = regionLabel;

	if (!SKIP_GEOCODE && lat !== null && lon !== null) {
		const cacheKey = `${lat},${lon}`;
		let address = geocodeCache.get(cacheKey);
		if (!address) {
			address = await reverseGeocode(lat, lon);
			geocodeCache.set(cacheKey, address);
			await sleep(GEOCODE_SLEEP_MS);
		}
		kommun = formatKommun(address, regionLabel);
		platsAdress = formatPlatsAdress(address, kommun);
	}

	const typeLabelRaw = typeMap.get(doc.type ?? -1) ?? "Okänd";
	const typ = typeLabelMap[typeLabelRaw] ?? typeLabelRaw;
	const organisation = doc.contactInfo?.owner?.trim() ?? doc.contactInfo?.name?.trim() ?? "";
	const epost = doc.contactInfo?.email?.trim() ?? "";
	const telefon = doc.contactInfo?.phone?.trim() ?? "";
	const omStuganUrl = doc.contactInfo?.url?.trim();
	const prisinfo = doc.price?.trim();
	const bokningslank = epost ? `mailto:${epost}` : omStuganUrl;

	const item = {
		id: `scoutstuga-${doc.id}`,
		kommun,
		namn: doc.name?.trim() ?? "",
		organisation,
		typ,
		platsAdress,
		epost,
		telefon,
		ovrigt: buildOvrigt(doc),
		latitud: lat,
		longitud: lon,
		koordinatKalla: "scoutstuga.se",
		noggrannhet: "punkt (hög)",
		senastKontrollerad: today,
		...(omStuganUrl ? { omStuganUrl } : {}),
		...(prisinfo
			? {
					prisinfo,
					prisKallaUrl: omStuganUrl,
					prisKallaNotering: "Prisuppgift från scoutstuga.se.",
				}
			: {}),
		...(bokningslank
			? {
					bokningslank,
					bokningsKallaUrl: omStuganUrl,
					bokningsKallaNotering: "Kontaktuppgifter från scoutstuga.se.",
				}
			: {}),
	};

	const beds = doc.amenities?.beds;
	if (typeof beds === "number" && beds > 0) {
		item.sangar = beds;
	}
	const floorSpaces = doc.amenities?.floorSpaces;
	if (typeof floorSpaces === "number" && floorSpaces > 0) {
		item.golvytaM2 = floorSpaces;
	}
	if (typeof doc.amenities?.electricity === "boolean") {
		item.el = doc.amenities.electricity;
	}
	if (typeof doc.amenities?.water === "number") {
		item.vatten = doc.amenities.water > 0;
	}

	items.push(item);
}

items.sort((a, b) => {
	const kommunSort = a.kommun.localeCompare(b.kommun, "sv");
	if (kommunSort !== 0) return kommunSort;
	return a.namn.localeCompare(b.namn, "sv");
});

const existingItems = await readJsonIfExists(OUTPUT_PATH);
const existingById = new Map(
	Array.isArray(existingItems)
		? existingItems.map((item) => [item.id, item])
		: [],
);
const incomingById = new Map(items.map((item) => [item.id, item]));
const conflicts = [];
const removedIds = [];

for (const [id, existing] of existingById.entries()) {
	const incoming = incomingById.get(id);
	if (!incoming) {
		removedIds.push(id);
		continue;
	}
	const diffs = diffFields(existing, incoming);
	if (diffs.length > 0) {
		conflicts.push({ id, diffs });
	}
}

const resolutions = await readJsonIfExists(RESOLUTION_PATH);
const resolutionById =
	resolutions && typeof resolutions === "object" && !Array.isArray(resolutions)
		? resolutions
		: {};
const resolvedConflicts = [];
const unresolvedConflicts = [];

for (const conflict of conflicts) {
	const incoming = incomingById.get(conflict.id);
	const existing = existingById.get(conflict.id);
	if (!incoming || !existing) {
		unresolvedConflicts.push(conflict);
		continue;
	}

	const fieldResolutions =
		resolutionById?.[conflict.id] &&
		typeof resolutionById[conflict.id] === "object"
			? resolutionById[conflict.id]
			: {};

	const resolvedDiffs = [];
	const unresolvedDiffs = [];

	for (const diff of conflict.diffs) {
		const resolution = fieldResolutions[diff.key];
		if (resolution === "keepExisting") {
			incoming[diff.key] = diff.existing;
			resolvedDiffs.push({ ...diff, resolution });
		} else if (resolution === "acceptIncoming") {
			resolvedDiffs.push({ ...diff, resolution });
		} else {
			unresolvedDiffs.push(diff);
		}
	}

	if (resolvedDiffs.length > 0) {
		resolvedConflicts.push({ id: conflict.id, diffs: resolvedDiffs });
	}
	if (unresolvedDiffs.length > 0) {
		unresolvedConflicts.push({ id: conflict.id, diffs: unresolvedDiffs });
	}
}

const stockholmPath = resolve(
	process.cwd(),
	"data",
	"scoutstugor.stockholm.json",
);
const stockholmItems = await readJsonIfExists(stockholmPath);
const stockholmIds = new Set(
	Array.isArray(stockholmItems)
		? stockholmItems.map((item) => item.id)
		: [],
);
const idCollisions = items
	.filter((item) => stockholmIds.has(item.id))
	.map((item) => item.id);

const hasUnresolved =
	unresolvedConflicts.length > 0 ||
	removedIds.length > 0 ||
	idCollisions.length > 0;
const hasAnyConflicts =
	conflicts.length > 0 || removedIds.length > 0 || idCollisions.length > 0;
const report = {
	generatedAt: new Date().toISOString(),
	outputPath: OUTPUT_PATH,
	totalIncoming: items.length,
	existingCount: existingById.size,
	conflictCount: conflicts.length,
	resolvedCount: resolvedConflicts.length,
	unresolvedCount: unresolvedConflicts.length,
	removedCount: removedIds.length,
	collisionCount: idCollisions.length,
	conflicts: unresolvedConflicts,
	resolvedConflicts,
	removedIds,
	idCollisions,
	resolutionsPath: RESOLUTION_PATH,
};

if (hasAnyConflicts) {
	await writeFile(CONFLICT_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, {
		encoding: "utf8",
	});
	if (!APPLY_CHANGES || hasUnresolved) {
		throw new Error(
			`Konflikter hittades. Granska ${CONFLICT_REPORT_PATH} och kör med --apply när allt är löst.`,
		);
	}
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(items, null, "\t")}\n`, {
	encoding: "utf8",
});

console.log(
	`Skrev ${items.length} poster till ${OUTPUT_PATH} (Stockholm ${
		INCLUDE_STOCKHOLM ? "inkluderat" : "exkluderat"
	}).`,
);

<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/state";
import OsmMap from "$lib/components/OsmMap.svelte";
import TravelBatchPlanner from "$lib/components/TravelBatchPlanner.svelte";
import TravelPlanner from "$lib/components/TravelPlanner.svelte";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();
const regionLabel = data.regionLabel;
const pageTitle = `Scoutstugor i ${regionLabel}`;
const pageDescription = `Lista över scoutstugor i ${regionLabel} med filtrering och kontaktuppgifter.`;

type TriStateYesNo = "" | "ja" | "nej";
type ToalettFilter = "" | "inne" | "ute" | "båda" | "ingen";

function parseTriStateYesNo(value: string | null): TriStateYesNo {
	if (value === "ja" || value === "nej") return value;
	return "";
}

function parseToalettFilter(value: string | null): ToalettFilter {
	if (
		value === "inne" ||
		value === "ute" ||
		value === "båda" ||
		value === "ingen"
	) {
		return value;
	}
	return "";
}

function parseNonNegativeInt(value: string | null): number | null {
	if (!value) return null;
	if (!/^\d+$/.test(value)) return null;
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

function parseNonNegativeNumber(value: string | null): number | null {
	if (!value) return null;
	if (!/^\d+(\.\d+)?$/.test(value)) return null;
	const n = Number.parseFloat(value);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

function readParam(key: string): string {
	return page.url.searchParams.get(key) ?? "";
}

let query = $state(readParam("q"));
let selectedKommun = $state(readParam("kommun"));
let selectedTyp = $state(readParam("typ"));

// Advanced filters (URL-synced)
let elFilter = $state<TriStateYesNo>(parseTriStateYesNo(readParam("el")));
let vattenFilter = $state<TriStateYesNo>(
	parseTriStateYesNo(readParam("vatten")),
);
let toalettFilter = $state<ToalettFilter>(
	parseToalettFilter(readParam("toalett")),
);
let minSangar = $state<number | null>(parseNonNegativeInt(readParam("minS")));
let minGolvytaM2 = $state<number | null>(
	parseNonNegativeInt(readParam("minM2")),
);
let maxBadplatsBilKm = $state<number | null>(
	parseNonNegativeNumber(readParam("maxBadBil")),
);
let maxBadplatsGangKm = $state<number | null>(
	parseNonNegativeNumber(readParam("maxBadGang")),
);
let maxMataffarBilKm = $state<number | null>(
	parseNonNegativeNumber(readParam("maxMatBil")),
);
let maxMataffarGangKm = $state<number | null>(
	parseNonNegativeNumber(readParam("maxMatGang")),
);
let hasCoordinates = $state(readParam("coords") === "1");
let hasPrisinfo = $state(readParam("pris") === "1");
let hasBokningslank = $state(readParam("bok") === "1");

const initialAdvancedOpen = Boolean(
	readParam("el") ||
		readParam("vatten") ||
		readParam("toalett") ||
		readParam("minS") ||
		readParam("minM2") ||
		readParam("maxBadBil") ||
		readParam("maxBadGang") ||
		readParam("maxMatBil") ||
		readParam("maxMatGang") ||
		readParam("coords") ||
		readParam("pris") ||
		readParam("bok"),
);
let advancedOpen = $state(initialAdvancedOpen);

let focusedId = $state<string | null>(null);
let plannerStugaId = $state<string | null>(null);
let travelTimesById = $state<
	Record<
		string,
		{
			pt: {
				durationMs: number;
				departAt: string;
				arriveAt: string;
				changes: number | null;
			};
		}
	>
>({});
let sortBy = $state<"" | "pt">("");

const kommuner = $derived.by(() => {
	const values = new Set(
		data.stugor
			.map((stuga) => stuga.kommun)
			.filter((value) => value.length > 0),
	);
	return [...values].sort((a, b) => a.localeCompare(b, "sv"));
});

const typer = $derived.by(() => {
	const values = new Set(
		data.stugor.map((stuga) => stuga.typ).filter((value) => value.length > 0),
	);
	return [...values].sort((a, b) => a.localeCompare(b, "sv"));
});

const activeAdvancedCount = $derived.by(() => {
	let count = 0;
	if (elFilter) count += 1;
	if (vattenFilter) count += 1;
	if (toalettFilter) count += 1;
	if (typeof minSangar === "number") count += 1;
	if (typeof minGolvytaM2 === "number") count += 1;
	if (typeof maxBadplatsBilKm === "number") count += 1;
	if (typeof maxBadplatsGangKm === "number") count += 1;
	if (typeof maxMataffarBilKm === "number") count += 1;
	if (typeof maxMataffarGangKm === "number") count += 1;
	if (hasCoordinates) count += 1;
	if (hasPrisinfo) count += 1;
	if (hasBokningslank) count += 1;
	return count;
});

function facilityTokens(stuga: PageData["stugor"][number]): string[] {
	const tokens: string[] = [];
	if (typeof stuga.golvytaM2 === "number")
		tokens.push(`${stuga.golvytaM2}`, "m2", "m²");
	if (typeof stuga.sangar === "number")
		tokens.push(`${stuga.sangar}`, "säng", "sängar");
	if (typeof stuga.el === "boolean") tokens.push("el", stuga.el ? "ja" : "nej");
	if (typeof stuga.vatten === "boolean")
		tokens.push("vatten", stuga.vatten ? "ja" : "nej");
	if (stuga.toalett) {
		tokens.push("toalett", stuga.toalett);
		if (stuga.toalett === "inne") tokens.push("innetoalett");
		if (stuga.toalett === "ute") tokens.push("utedass");
	}
	return tokens;
}

function facilityIcons(
	stuga: PageData["stugor"][number],
): Array<{ emoji: string; label: string; crossed?: boolean }> {
	const icons: Array<{ emoji: string; label: string; crossed?: boolean }> = [];

	if (stuga.el === true)
		icons.push({ emoji: "🔌", label: "El finns i stugan" });
	if (stuga.el === false)
		icons.push({ emoji: "🔌", label: "Ingen el", crossed: true });

	if (stuga.vattenTyp === "inne") {
		icons.push({ emoji: "🚰", label: "Vatten finns inne (kran)" });
	} else if (stuga.vattenTyp === "pump") {
		icons.push({ emoji: "🚰", label: "Vatten via handpump ute" });
	} else if (stuga.vatten === true) {
		// Backwards compatible fallback when we only know "has water"
		icons.push({ emoji: "🚰", label: "Vatten finns (typ okänd)" });
	}

	if (stuga.toalett === "inne") {
		icons.push({ emoji: "🚽", label: "Innetoalett" });
	} else if (stuga.toalett === "ute") {
		icons.push({ emoji: "🚾", label: "Dass (utedass)" });
	} else if (stuga.toalett === "båda") {
		icons.push({ emoji: "🚽", label: "Innetoalett" });
		icons.push({ emoji: "🚾", label: "Dass (utedass)" });
	}

	return icons;
}

$effect(() => {
	const sp = page.url.searchParams;
	query = sp.get("q") ?? "";
	selectedKommun = sp.get("kommun") ?? "";
	selectedTyp = sp.get("typ") ?? "";

	elFilter = parseTriStateYesNo(sp.get("el"));
	vattenFilter = parseTriStateYesNo(sp.get("vatten"));
	toalettFilter = parseToalettFilter(sp.get("toalett"));
	minSangar = parseNonNegativeInt(sp.get("minS"));
	minGolvytaM2 = parseNonNegativeInt(sp.get("minM2"));
	maxBadplatsBilKm = parseNonNegativeNumber(sp.get("maxBadBil"));
	maxBadplatsGangKm = parseNonNegativeNumber(sp.get("maxBadGang"));
	maxMataffarBilKm = parseNonNegativeNumber(sp.get("maxMatBil"));
	maxMataffarGangKm = parseNonNegativeNumber(sp.get("maxMatGang"));
	hasCoordinates = sp.get("coords") === "1";
	hasPrisinfo = sp.get("pris") === "1";
	hasBokningslank = sp.get("bok") === "1";
});

$effect(() => {
	// Effects don't run during SSR, but keep this explicit for safety.
	if (typeof window === "undefined") return;

	const params = new URLSearchParams();
	const q = query.trim();
	if (q) params.set("q", q);
	if (selectedKommun) params.set("kommun", selectedKommun);
	if (selectedTyp) params.set("typ", selectedTyp);

	if (elFilter) params.set("el", elFilter);
	if (vattenFilter) params.set("vatten", vattenFilter);
	if (toalettFilter) params.set("toalett", toalettFilter);
	if (typeof minSangar === "number") params.set("minS", String(minSangar));
	if (typeof minGolvytaM2 === "number")
		params.set("minM2", String(minGolvytaM2));
	if (typeof maxBadplatsBilKm === "number")
		params.set("maxBadBil", String(maxBadplatsBilKm));
	if (typeof maxBadplatsGangKm === "number")
		params.set("maxBadGang", String(maxBadplatsGangKm));
	if (typeof maxMataffarBilKm === "number")
		params.set("maxMatBil", String(maxMataffarBilKm));
	if (typeof maxMataffarGangKm === "number")
		params.set("maxMatGang", String(maxMataffarGangKm));
	if (hasCoordinates) params.set("coords", "1");
	if (hasPrisinfo) params.set("pris", "1");
	if (hasBokningslank) params.set("bok", "1");

	const next = params.toString();
	const current = page.url.searchParams.toString();
	if (next === current) return;

	const href = next ? `${page.url.pathname}?${next}` : page.url.pathname;
	goto(href, { replaceState: true, keepFocus: true, noScroll: true });
});

const filtered = $derived.by(() => {
	const q = query.trim().toLowerCase();
	const minS = typeof minSangar === "number" ? minSangar : null;
	const minM2 = typeof minGolvytaM2 === "number" ? minGolvytaM2 : null;

	return data.stugor.filter((stuga) => {
		if (selectedKommun && stuga.kommun !== selectedKommun) return false;
		if (selectedTyp && stuga.typ !== selectedTyp) return false;

		if (elFilter) {
			if (typeof stuga.el !== "boolean") return false;
			if (elFilter === "ja" && stuga.el !== true) return false;
			if (elFilter === "nej" && stuga.el !== false) return false;
		}

		if (vattenFilter) {
			if (typeof stuga.vatten !== "boolean") return false;
			if (vattenFilter === "ja" && stuga.vatten !== true) return false;
			if (vattenFilter === "nej" && stuga.vatten !== false) return false;
		}

		if (toalettFilter) {
			if (!stuga.toalett) return false;
			if (stuga.toalett !== toalettFilter) return false;
		}

		if (typeof minS === "number") {
			if (typeof stuga.sangar !== "number") return false;
			if (stuga.sangar < minS) return false;
		}

		if (typeof minM2 === "number") {
			if (typeof stuga.golvytaM2 !== "number") return false;
			if (stuga.golvytaM2 < minM2) return false;
		}

		if (typeof maxBadplatsBilKm === "number") {
			if (typeof stuga.avstandBadplatsBilM !== "number") return false;
			if (stuga.avstandBadplatsBilM > maxBadplatsBilKm * 1000) return false;
		}

		if (typeof maxBadplatsGangKm === "number") {
			if (typeof stuga.avstandBadplatsGangM !== "number") return false;
			if (stuga.avstandBadplatsGangM > maxBadplatsGangKm * 1000) return false;
		}

		if (typeof maxMataffarBilKm === "number") {
			if (typeof stuga.avstandMataffarBilM !== "number") return false;
			if (stuga.avstandMataffarBilM > maxMataffarBilKm * 1000) return false;
		}

		if (typeof maxMataffarGangKm === "number") {
			if (typeof stuga.avstandMataffarGangM !== "number") return false;
			if (stuga.avstandMataffarGangM > maxMataffarGangKm * 1000) return false;
		}

		if (hasCoordinates) {
			if (stuga.latitud === null || stuga.longitud === null) return false;
		}

		if (hasPrisinfo) {
			if (!stuga.prisinfo) return false;
		}

		if (hasBokningslank) {
			if (!stuga.bokningslank) return false;
		}

		if (!q) return true;

		const haystack = [
			stuga.namn,
			stuga.kommun,
			stuga.organisation,
			stuga.typ,
			stuga.platsAdress,
			stuga.epost,
			stuga.telefon,
			stuga.ovrigt,
			...facilityTokens(stuga),
			stuga.omStuganUrl,
			stuga.karUrl,
			stuga.prisinfo,
			stuga.bokningslank,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();

		return haystack.includes(q);
	});
});

const displayed = $derived.by(() => {
	const items = [...filtered];
	if (sortBy) {
		items.sort((a, b) => {
			const ta = travelTimesById[a.id];
			const tb = travelTimesById[b.id];
			const va = ta?.pt.durationMs;
			const vb = tb?.pt.durationMs;
			if (typeof va !== "number" && typeof vb !== "number") return 0;
			if (typeof va !== "number") return 1;
			if (typeof vb !== "number") return -1;
			return va - vb;
		});
	}

	if (focusedId) {
		const focusedIndex = items.findIndex((stuga) => stuga.id === focusedId);
		if (focusedIndex > 0) {
			const [focused] = items.splice(focusedIndex, 1);
			items.unshift(focused);
		}
	}

	return items;
});

const filteredWithCoordinates = $derived.by(() =>
	filtered.filter((stuga) => stuga.latitud !== null && stuga.longitud !== null),
);

const selectedStuga = $derived.by(() => {
	if (!focusedId) return null;
	return filtered.find((stuga) => stuga.id === focusedId) ?? null;
});

$effect(() => {
	if (!focusedId) return;
	if (!selectedStuga) focusedId = null;
});

function resetFilters() {
	query = "";
	selectedKommun = "";
	selectedTyp = "";
	elFilter = "";
	vattenFilter = "";
	toalettFilter = "";
	minSangar = null;
	minGolvytaM2 = null;
	maxBadplatsBilKm = null;
	maxBadplatsGangKm = null;
	maxMataffarBilKm = null;
	maxMataffarGangKm = null;
	hasCoordinates = false;
	hasPrisinfo = false;
	hasBokningslank = false;
	advancedOpen = false;
	focusedId = null;
}

function toTelHref(value: string): string {
	const sanitized = value.replaceAll(/[^\d+]/g, "");
	return sanitized ? `tel:${sanitized}` : "#";
}

function openInOsm(stuga: PageData["stugor"][number]): string {
	if (stuga.latitud === null || stuga.longitud === null) return "#";
	const zoom = 17;
	return `https://www.openstreetmap.org/?mlat=${stuga.latitud}&mlon=${stuga.longitud}#map=${zoom}/${stuga.latitud}/${stuga.longitud}`;
}

function focusOnMap(id: string) {
	focusedId = id;
	if (typeof document === "undefined") return;
	document
		.getElementById("karta")
		?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusInList(id: string) {
	focusedId = id;
}

function openTravelPlanner(id: string) {
	plannerStugaId = id;
}

function closeTravelPlanner() {
	plannerStugaId = null;
}

function formatDuration(ms: number): string {
	const totalMinutes = Math.round(ms / 60_000);
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
}

function formatDistanceKm(distanceM: number): string {
	const km = distanceM / 1000;
	if (km < 10) return `${km.toFixed(1)} km`;
	return `${Math.round(km)} km`;
}
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta
		name="description"
		content={pageDescription}
	/>
</svelte:head>

<main class="page">
	<header class="hero">
		<h1>{pageTitle}</h1>
	</header>

	<section class="filters" aria-label="Filter">
		<label class="field">
			<span class="label">Sök</span>
			<input
				class="input"
				type="search"
				placeholder="Namn, organisation, adress, kontakt…"
				bind:value={query}
			/>
		</label>

		<label class="field">
			<span class="label">Kommun</span>
			<select class="input" bind:value={selectedKommun}>
				<option value="">Alla kommuner</option>
				{#each kommuner as kommun (kommun)}
					<option value={kommun}>{kommun}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span class="label">Typ</span>
			<select class="input" bind:value={selectedTyp}>
				<option value="">Alla typer</option>
				{#each typer as typ (typ)}
					<option value={typ}>{typ}</option>
				{/each}
			</select>
		</label>

		<div class="summary">
			<span>Visar <strong>{filtered.length}</strong> av {data.stugor.length}</span>
			<button class="reset" type="button" onclick={resetFilters}>Rensa</button>
		</div>

		<details class="advancedDetails" bind:open={advancedOpen}>
			<summary class="advancedSummary">
				<span class="advancedSummaryLeft">
					<span>Avancerat urval</span>
					{#if activeAdvancedCount > 0}
						<span class="advancedPill">{activeAdvancedCount} aktivt</span>
					{/if}
				</span>
				<span class="advancedChevron" aria-hidden="true">
					{advancedOpen ? "▴" : "▾"}
				</span>
			</summary>
			<div class="advancedBody">
				<div class="advancedGrid">
					<label class="field">
						<span class="label">El</span>
						<select class="input" bind:value={elFilter}>
							<option value="">Alla</option>
							<option value="ja">Ja</option>
							<option value="nej">Nej</option>
						</select>
					</label>

					<label class="field">
						<span class="label">Vatten</span>
						<select class="input" bind:value={vattenFilter}>
							<option value="">Alla</option>
							<option value="ja">Ja</option>
							<option value="nej">Nej</option>
						</select>
					</label>

					<label class="field">
						<span class="label">Toalett</span>
						<select class="input" bind:value={toalettFilter}>
							<option value="">Alla</option>
							<option value="inne">Inne</option>
							<option value="ute">Ute</option>
							<option value="båda">Båda</option>
							<option value="ingen">Ingen</option>
						</select>
					</label>

					<label class="field">
						<span class="label">Min sängar</span>
						<input
							class="input"
							type="number"
							min="0"
							step="1"
							inputmode="numeric"
							placeholder="t.ex. 12"
							bind:value={minSangar}
						/>
					</label>

					<label class="field">
						<span class="label">Min m²</span>
						<input
							class="input"
							type="number"
							min="0"
							step="1"
							inputmode="numeric"
							placeholder="t.ex. 60"
							bind:value={minGolvytaM2}
						/>
					</label>

					<label class="field">
						<span class="label">Max km till badplats (bil)</span>
						<input
							class="input"
							type="number"
							min="0"
							step="0.1"
							inputmode="decimal"
							placeholder="t.ex. 2.5"
							bind:value={maxBadplatsBilKm}
						/>
					</label>

					<label class="field">
						<span class="label">Max km till badplats (gång)</span>
						<input
							class="input"
							type="number"
							min="0"
							step="0.1"
							inputmode="decimal"
							placeholder="t.ex. 3"
							bind:value={maxBadplatsGangKm}
						/>
					</label>

					<label class="field">
						<span class="label">Max km till mataffär (bil)</span>
						<input
							class="input"
							type="number"
							min="0"
							step="0.1"
							inputmode="decimal"
							placeholder="t.ex. 5"
							bind:value={maxMataffarBilKm}
						/>
					</label>

					<label class="field">
						<span class="label">Max km till mataffär (gång)</span>
						<input
							class="input"
							type="number"
							min="0"
							step="0.1"
							inputmode="decimal"
							placeholder="t.ex. 6"
							bind:value={maxMataffarGangKm}
						/>
					</label>
				</div>

				<div class="advancedChecks" aria-label="Avancerade filter">
					<label class="check">
						<input class="checkInput" type="checkbox" bind:checked={hasCoordinates} />
						<span>Har koordinater</span>
					</label>
					<label class="check">
						<input class="checkInput" type="checkbox" bind:checked={hasPrisinfo} />
						<span>Har prisinfo</span>
					</label>
					<label class="check">
						<input class="checkInput" type="checkbox" bind:checked={hasBokningslank} />
						<span>Har bokningslänk</span>
					</label>
				</div>
			</div>
		</details>

		<div class="travelTools">
			<TravelBatchPlanner stugor={filtered} onResults={(times) => (travelTimesById = times)} />
			<label class="sortLabel">
				<span class="label">Sortera</span>
				<select class="input" bind:value={sortBy}>
					<option value="">Ingen</option>
					<option value="pt">Restid kollektivtrafik</option>
				</select>
			</label>
		</div>
	</section>

	<section class="mapSection" aria-label="Karta" id="karta">
		<OsmMap stugor={filtered} focusedId={focusedId} onSelect={focusInList} />
		{#if filteredWithCoordinates.length === 0}
			<p class="mapHint">Inga koordinater i urvalet ännu.</p>
		{/if}
	</section>

	<section class="detailSection" aria-live="polite">
		{#if filtered.length === 0}
			<p class="empty">Inga träffar. Prova att ändra sökning eller filter.</p>
		{:else if !selectedStuga}
			<p class="empty">Välj en stuga i kartan för att se detaljer.</p>
		{:else}
			{@const stuga = selectedStuga}
			{@const icons = facilityIcons(stuga)}
			<div class="card">
				<div class="cardHeader">
					<div class="titleRow">
						<h2 class="name">{stuga.namn}</h2>
						{#if icons.length > 0}
							<div class="icons" aria-label="Faciliteter">
								{#each icons as icon (icon.label)}
									<span class="icon" role="img" title={icon.label} aria-label={icon.label}>
										<span class="iconEmoji" title={icon.label}>{icon.emoji}</span>
										{#if icon.crossed}
											<span class="iconCross" aria-hidden="true">✕</span>
										{/if}
									</span>
								{/each}
							</div>
						{/if}
					</div>
					<div class="badges">
						<span class="badge">{stuga.kommun}</span>
						<span class="badge badgeSecondary">{stuga.typ}</span>
					</div>
				</div>

				{#if stuga.organisation}
					<p class="meta"><span class="metaLabel">Organisation</span> {stuga.organisation}</p>
				{/if}
				{#if stuga.platsAdress}
					<p class="meta"><span class="metaLabel">Plats/adress</span> {stuga.platsAdress}</p>
				{/if}
				{#if typeof stuga.avstandBadplatsBilM === "number" || typeof stuga.avstandMataffarBilM === "number"}
					<p class="meta">
						<span class="metaLabel">Närhet (bil)</span>
						{#if typeof stuga.avstandBadplatsBilM === "number"}
							Badplats {formatDistanceKm(stuga.avstandBadplatsBilM)}
						{/if}
						{#if typeof stuga.avstandBadplatsBilM === "number" &&
							typeof stuga.avstandMataffarBilM === "number"}
							<span class="sep">·</span>
						{/if}
						{#if typeof stuga.avstandMataffarBilM === "number"}
							Mataffär {formatDistanceKm(stuga.avstandMataffarBilM)}
						{/if}
					</p>
				{/if}
				{#if typeof stuga.avstandBadplatsGangM === "number" || typeof stuga.avstandMataffarGangM === "number"}
					<p class="meta">
						<span class="metaLabel">Närhet (gång)</span>
						{#if typeof stuga.avstandBadplatsGangM === "number"}
							Badplats {formatDistanceKm(stuga.avstandBadplatsGangM)}
						{/if}
						{#if typeof stuga.avstandBadplatsGangM === "number" &&
							typeof stuga.avstandMataffarGangM === "number"}
							<span class="sep">·</span>
						{/if}
						{#if typeof stuga.avstandMataffarGangM === "number"}
							Mataffär {formatDistanceKm(stuga.avstandMataffarGangM)}
						{/if}
					</p>
				{/if}

				{#if stuga.omStuganUrl || stuga.karUrl}
					<p class="meta">
						<span class="metaLabel">Mer info</span>
						<span class="contact">
							{#if stuga.omStuganUrl}
								<a class="link" href={stuga.omStuganUrl} target="_blank" rel="noreferrer">
									Om stugan
								</a>
							{/if}
							{#if stuga.karUrl}
								{#if stuga.omStuganUrl}<span class="sep">·</span>{/if}
								<a class="link" href={stuga.karUrl} target="_blank" rel="noreferrer">
									Kårens sida
								</a>
							{/if}
						</span>
					</p>
				{/if}

				{#if stuga.epost || stuga.telefon}
					<p class="meta">
						<span class="metaLabel">Kontakt</span>
						<span class="contact">
							{#if stuga.epostadresser.length > 0}
								{#each stuga.epostadresser as email, emailIndex (email)}
									<a class="link" href={`mailto:${email}`}>{email}</a>{#if
										emailIndex !== stuga.epostadresser.length - 1
									}<span class="sep">·</span>{/if}
								{/each}
							{:else if stuga.epost}
								<span>{stuga.epost}</span>
							{/if}

							{#if stuga.telefon}
								{#if stuga.epost || stuga.epostadresser.length > 0}
									<span class="sep">·</span>
								{/if}
								<a class="link" href={toTelHref(stuga.telefon)}>{stuga.telefon}</a>
							{/if}
						</span>
					</p>
				{/if}

				{#if stuga.ovrigt}
					<p class="meta metaOther">{stuga.ovrigt}</p>
				{/if}

				{#if stuga.prisinfo || stuga.bokningslank}
					<div class="enrichment" aria-label="Pris och bokning">
						{#if stuga.prisinfo}
							<p class="meta metaOther">
								<span class="metaLabel">Pris</span> {stuga.prisinfo}
								{#if stuga.prisKallaUrl}
									<a class="link" href={stuga.prisKallaUrl} target="_blank" rel="noreferrer">
										Källa
									</a>
								{/if}
							</p>
						{/if}
						{#if stuga.bokningslank}
							<p class="meta metaOther">
								<span class="metaLabel">Bokning</span>
								<a class="link" href={stuga.bokningslank} target="_blank" rel="noreferrer">
									Öppna bokning
								</a>
								{#if stuga.bokningsKallaUrl}
									<a class="link" href={stuga.bokningsKallaUrl} target="_blank" rel="noreferrer">
										Källa
									</a>
								{/if}
							</p>
						{/if}
						{#if stuga.senastKontrollerad}
							<p class="meta metaOther">
								<span class="metaLabel">Kontrollerad</span> {stuga.senastKontrollerad}
							</p>
						{/if}
					</div>
				{/if}

				<div class="actions">
					{#if stuga.latitud !== null && stuga.longitud !== null}
						<button class="actionButton" type="button" onclick={() => focusOnMap(stuga.id)}>
							Visa på karta
						</button>
						<button class="actionButton" type="button" onclick={() => openTravelPlanner(stuga.id)}>
							Planera övernattning/hajk
						</button>
						<a class="actionLink" href={openInOsm(stuga)} target="_blank" rel="noreferrer">
							Öppna i OpenStreetMap
						</a>
						{#if stuga.noggrannhet}
							<span class="accuracy">{stuga.noggrannhet}</span>
						{/if}
					{:else}
						<span class="noCoords">Saknar koordinater</span>
					{/if}
				</div>

				{#if travelTimesById[stuga.id]}
					<div class="travelTimes" aria-label="Restider">
						<span class="timePill timePillSecondary">
							SL: <strong>{formatDuration(travelTimesById[stuga.id].pt.durationMs)}</strong>
						</span>
					</div>
				{/if}
			</div>
		{/if}
	</section>

	{#if plannerStugaId}
		{@const stuga = data.stugor.find((s) => s.id === plannerStugaId)}
		{#if stuga}
			<TravelPlanner stuga={stuga} onClose={closeTravelPlanner} />
		{/if}
	{/if}
</main>

<style>
	.page {
		min-height: 100vh;
	padding: 12px 16px 56px;
		background: radial-gradient(1200px circle at 15% 0%, #eef3ff 0%, #f7f8fb 55%, #ffffff 100%);
		color: #0f172a;
		font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
			"Noto Sans", "Liberation Sans", sans-serif;
	}

	.hero {
		max-width: 1100px;
	margin: 0 auto 8px;
	}

	h1 {
	margin: 0 0 4px;
	font-size: clamp(22px, 3.2vw, 32px);
	letter-spacing: -0.015em;
	}


	.filters {
		max-width: 1100px;
	margin: 0 auto 4px;
		display: grid;
		grid-template-columns: 1.6fr 1fr 1fr auto;
		gap: 12px;
		align-items: end;
	}

	.field {
		display: grid;
		gap: 6px;
	}

	.label {
		font-size: 12px;
		font-weight: 600;
		color: #475569;
		letter-spacing: 0.02em;
	}

	.input {
		border: 1px solid rgba(15, 23, 42, 0.16);
		border-radius: 12px;
		padding: 10px 12px;
		font-size: 14px;
		background: rgba(255, 255, 255, 0.8);
		backdrop-filter: blur(8px);
	}

	.input:focus {
		outline: 3px solid rgba(37, 99, 235, 0.25);
		border-color: rgba(37, 99, 235, 0.5);
	}

	.summary {
		display: flex;
		gap: 12px;
		align-items: center;
		justify-content: flex-end;
		padding-bottom: 2px;
		white-space: nowrap;
		color: #334155;
		font-size: 14px;
	}

	.advancedDetails {
		grid-column: 1 / -1;
		border: 1px solid rgba(148, 163, 184, 0.5);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.7);
		backdrop-filter: blur(10px);
		overflow: hidden;
	}

	.advancedSummary {
		display: flex;
		gap: 10px;
		align-items: center;
		justify-content: space-between;
	padding: 6px 10px;
		cursor: pointer;
	font-size: 13px;
		font-weight: 700;
		color: #0f172a;
	}

	.advancedSummaryLeft {
		display: inline-flex;
		gap: 10px;
		align-items: center;
	}

	.advancedSummary::-webkit-details-marker {
		display: none;
	}

	.advancedPill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	padding: 2px 8px;
		border-radius: 999px;
	font-size: 11px;
		font-weight: 900;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
		white-space: nowrap;
	}

	.advancedChevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 10px;
		border: 1px solid rgba(15, 23, 42, 0.1);
		background: rgba(15, 23, 42, 0.04);
		color: #334155;
		font-size: 14px;
		line-height: 1;
		flex: 0 0 auto;
	}

	.advancedBody {
		border-top: 1px solid rgba(15, 23, 42, 0.08);
		padding: 12px;
		display: grid;
		gap: 12px;
	}

	.advancedGrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
		align-items: end;
	}

	.advancedChecks {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 12px;
		border: 1px solid rgba(15, 23, 42, 0.1);
		background: rgba(15, 23, 42, 0.04);
		font-size: 14px;
		color: #1f2937;
	}

	.checkInput {
		width: 16px;
		height: 16px;
	}

	.travelTools {
		grid-column: 1 / -1;
		display: flex;
		gap: 12px;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		margin-top: 6px;
	}

	.sortLabel {
		display: grid;
		gap: 6px;
	}

	.reset {
		border: 1px solid rgba(15, 23, 42, 0.2);
		border-radius: 999px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		font-weight: 600;
		color: #0f172a;
	}

	.reset:hover {
		border-color: rgba(37, 99, 235, 0.45);
	}

	.empty {
		max-width: 1100px;
		margin: 18px auto 0;
		color: #475569;
	}

.detailSection {
	max-width: 1100px;
	margin: 0 auto;
}

	.mapSection {
		max-width: 1100px;
		margin: 0 auto 20px;
		display: grid;
		gap: 10px;
	}

	.mapHint {
		margin: 0;
		color: #64748b;
		font-size: 13px;
	}

	.card {
		background: rgba(255, 255, 255, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.4);
		border-radius: 18px;
		padding: 16px 16px 14px;
		box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
		backdrop-filter: blur(10px);
	}

	.cardHeader {
		display: grid;
		gap: 10px;
		margin-bottom: 8px;
	}

	.titleRow {
		display: flex;
		gap: 6px;
		align-items: baseline;
		justify-content: flex-start;
		flex-wrap: nowrap;
	}

	.name {
		margin: 0;
	font-size: 16px;
	line-height: 1.2;
	letter-spacing: -0.005em;
		flex: 0 1 auto;
	}

	.badges {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.icons {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		cursor: default;
		user-select: none;
		white-space: nowrap;
		flex: 0 0 auto;
	}

	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
		font-size: 16px;
		line-height: 1;
		cursor: default;
		user-select: none;
	}

	.iconEmoji {
		display: inline-flex;
		cursor: default;
	}

	.iconCross {
		position: absolute;
		inset: -2px;
		display: grid;
		place-items: center;
		color: #dc2626;
		font-weight: 1000;
		font-size: 16px;
		line-height: 1;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.9);
		pointer-events: none;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 700;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
	}

	.badgeSecondary {
		background: rgba(15, 23, 42, 0.08);
		color: #334155;
	}

	.meta {
		margin: 0;
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 10px;
		font-size: 14px;
		line-height: 1.4;
		color: #1f2937;
		padding: 4px 0;
	}

	.metaOther {
		grid-template-columns: 1fr;
		color: #475569;
	}

	.enrichment {
		margin-top: 8px;
		display: grid;
		gap: 6px;
	}

	.metaLabel {
		font-weight: 700;
		color: #475569;
	}

	.contact {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.link {
		color: #1d4ed8;
		text-decoration: none;
		word-break: break-word;
	}

	.link:hover {
		text-decoration: underline;
	}

	.sep {
		color: rgba(100, 116, 139, 0.9);
	}

	.actions {
		margin-top: 10px;
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}

	.travelTimes {
		margin-top: 10px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}

	.timePill {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 6px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 800;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
	}

	.timePillSecondary {
		background: rgba(15, 23, 42, 0.08);
		color: #334155;
	}

	.actionButton {
		border: 1px solid rgba(15, 23, 42, 0.2);
		border-radius: 999px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		font-weight: 700;
		color: #0f172a;
	}

	.actionButton:hover {
		border-color: rgba(37, 99, 235, 0.45);
	}

	.actionLink {
		color: #1d4ed8;
		text-decoration: none;
		font-weight: 700;
		font-size: 13px;
	}

	.actionLink:hover {
		text-decoration: underline;
	}

	.noCoords {
		color: #64748b;
		font-size: 13px;
		font-weight: 700;
	}

	.accuracy {
		color: #334155;
		font-size: 12px;
		font-weight: 700;
		background: rgba(15, 23, 42, 0.06);
		border-radius: 999px;
		padding: 4px 10px;
	}

	@media (max-width: 920px) {
		.filters {
			grid-template-columns: 1fr;
			align-items: stretch;
		}

		.summary {
			justify-content: flex-start;
		}
	}

	@media (max-width: 420px) {
		.meta {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>

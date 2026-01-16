<script lang="ts">
import flatpickr from "flatpickr";
import { onMount } from "svelte";
import "flatpickr/dist/flatpickr.min.css";
import type { Scoutstuga } from "$lib/scoutstugor";
import type { GeocodeResult } from "$lib/server/travel/graphhopper";
import {
	DEFAULT_CAR_ORIGIN,
	DEFAULT_PT_ORIGIN,
} from "$lib/travel/defaultOrigins";
import {
	formatIsoLocalDatetime,
	parseIsoLocalDatetime,
} from "$lib/travel/isoLocalDatetime";
import type { LatLon, TravelMode, TravelResponse } from "$lib/travel/types";

let {
	stuga,
	onClose,
}: {
	stuga: Scoutstuga;
	onClose: () => void;
} = $props();

function hasCoords(
	s: Scoutstuga,
): s is Scoutstuga & { latitud: number; longitud: number } {
	return s.latitud !== null && s.longitud !== null;
}

const destination = $derived.by(() => {
	if (!hasCoords(stuga)) return null;
	return { lat: stuga.latitud, lon: stuga.longitud } satisfies LatLon;
});

let mode = $state<TravelMode>("direct");

// Inputs
let carQuery = $state(DEFAULT_CAR_ORIGIN.label);
let ptQuery = $state(DEFAULT_PT_ORIGIN.label);
let carSelected = $state<{ label: string; coord: LatLon } | null>(
	DEFAULT_CAR_ORIGIN,
);
let ptSelected = $state<{ label: string; coord: LatLon } | null>(
	DEFAULT_PT_ORIGIN,
);
let carResults = $state<GeocodeResult[]>([]);
let ptResults = $state<GeocodeResult[]>([]);
let carSearchLoading = $state(false);
let ptSearchLoading = $state(false);
let carLastEmpty = $state<string | null>(null);
let ptLastEmpty = $state<string | null>(null);
let carDebounce: ReturnType<typeof setTimeout> | null = null;
let ptDebounce: ReturnType<typeof setTimeout> | null = null;

let departLocal = $state(defaultDepartLocal());
let departInput = $state<HTMLInputElement | null>(null);
let departPicker: flatpickr.Instance | null = null;

// Result
let loading = $state(false);
let error = $state<string | null>(null);
let result = $state<TravelResponse | null>(null);

const resultsVm = $derived.by(() => {
	const departAt = parseIsoLocalDatetime(departLocal);
	if (!result) return null;

	const carArriveAtIso = departAt
		? new Date(departAt.getTime() + result.car.durationMs).toISOString()
		: null;
	const carDepartAtIso = departAt ? departAt.toISOString() : null;

	let walkDurationMs = 0;
	let walkDistanceM = 0;
	for (const leg of result.pt.legs) {
		if (leg.kind !== "walk") continue;
		if (typeof leg.durationMs === "number" && Number.isFinite(leg.durationMs))
			walkDurationMs += leg.durationMs;
		if (typeof leg.distanceM === "number" && Number.isFinite(leg.distanceM))
			walkDistanceM += leg.distanceM;
	}

	const diffMs = result.pt.durationMs - result.car.durationMs; // + => car faster
	const fastest = Math.abs(diffMs) < 60_000 ? "tie" : diffMs > 0 ? "car" : "pt";

	const deltaText =
		fastest === "tie"
			? "Likvärdiga restider"
			: fastest === "car"
				? `Bil är ${formatDuration(diffMs)} snabbare`
				: `Kollektivtrafik är ${formatDuration(-diffMs)} snabbare`;

	return {
		carDepartAtIso,
		carArriveAtIso,
		walkDurationMs,
		walkDistanceM,
		fastest,
		deltaText,
	};
});

const handleKeydown = (event: KeyboardEvent) => {
	if (event.key !== "Escape") return;
	event.preventDefault();
	onClose();
};

onMount(() => {
	window.addEventListener("keydown", handleKeydown);
	if (!departInput) return;
	departPicker = flatpickr(departInput, {
		enableTime: true,
		time_24hr: true,
		dateFormat: "Y-m-d H:i",
		defaultDate: departLocal,
		allowInput: true,
		onChange: (_dates, dateStr) => {
			departLocal = dateStr;
		},
	});

	return () => {
		window.removeEventListener("keydown", handleKeydown);
		departPicker?.destroy();
		departPicker = null;
	};
});

$effect(() => {
	if (!departPicker) return;
	const current = departPicker.input.value;
	if (departLocal && current !== departLocal) {
		departPicker.setDate(departLocal, false);
	}
	if (!departLocal && current) {
		departPicker.clear();
	}
});

function defaultDepartLocal(): string {
	const now = new Date();
	// Next Saturday 09:00 local time
	const day = now.getDay(); // 0 Sun ... 6 Sat
	const daysUntilSat = (6 - day + 7) % 7 || 7;
	const d = new Date(now);
	d.setDate(now.getDate() + daysUntilSat);
	d.setHours(9, 0, 0, 0);
	return formatIsoLocalDatetime(d);
}

function formatDuration(ms: number): string {
	const totalMinutes = Math.round(ms / 60_000);
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
}

function formatKm(m: number): string {
	const km = m / 1000;
	return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

function formatClock(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return "—";
	return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

function formatWalkDistance(meters: number): string {
	if (!Number.isFinite(meters) || meters <= 0) return "";
	if (meters < 1000) return `${Math.round(meters)} m`;
	const km = meters / 1000;
	return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

function ptChipClass(leg: TravelResponse["pt"]["legs"][number]): string {
	if (leg.kind === "walk") return "chipWalk";
	const code = (leg.catCode ?? "").toUpperCase();
	if (code.includes("BUS")) return "chipBus";
	if (code.includes("MET") || code.includes("SUB")) return "chipMetro";
	if (code.includes("TRAM") || code.includes("LRT")) return "chipTram";
	if (code.includes("TRAIN") || code.includes("RAIL")) return "chipTrain";
	if (code.includes("SHIP") || code.includes("FERRY") || code.includes("BOAT"))
		return "chipFerry";
	return "chipTransit";
}

function ptChipText(leg: TravelResponse["pt"]["legs"][number]): string {
	if (leg.kind === "walk") return "Gång";
	if (leg.line) return leg.line;
	if (leg.productName) return leg.productName;
	return "Resa";
}

function getErrorFromJson(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	const maybe = value as { error?: unknown };
	return typeof maybe.error === "string" ? maybe.error : null;
}

async function searchGeocode(which: "car" | "pt", query?: string) {
	const q = (query ?? (which === "car" ? carQuery : ptQuery)).trim();
	if (!q) return;
	error = null;

	if (which === "car") {
		carSearchLoading = true;
		carResults = [];
		carLastEmpty = null;
	} else {
		ptSearchLoading = true;
		ptResults = [];
		ptLastEmpty = null;
	}

	try {
		const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=6`);
		const data = (await res.json()) as {
			results?: GeocodeResult[];
			error?: string;
		};
		if (!res.ok)
			throw new Error(data.error ?? `Geocode failed (${res.status})`);
		const hits = data.results ?? [];
		if (which === "car") {
			carResults = hits;
			carLastEmpty = hits.length === 0 ? q : null;
		} else {
			ptResults = hits;
			ptLastEmpty = hits.length === 0 ? q : null;
		}
	} catch (e) {
		error = e instanceof Error ? e.message : "Okänt fel vid geokodning.";
	} finally {
		if (which === "car") carSearchLoading = false;
		else ptSearchLoading = false;
	}
}

function selectGeocode(which: "car" | "pt", hit: GeocodeResult) {
	const selected = { label: hit.label, coord: { lat: hit.lat, lon: hit.lon } };
	if (which === "car") {
		carSelected = selected;
		carQuery = selected.label;
		carResults = [];
	} else {
		ptSelected = selected;
		ptQuery = selected.label;
		ptResults = [];
	}
}

function clearOrigin(which: "car" | "pt") {
	if (which === "car") {
		carSelected = null;
		carResults = [];
		return;
	}
	ptSelected = null;
	ptResults = [];
}

function resetToDefaults() {
	carSelected = DEFAULT_CAR_ORIGIN;
	ptSelected = DEFAULT_PT_ORIGIN;
	carQuery = DEFAULT_CAR_ORIGIN.label;
	ptQuery = DEFAULT_PT_ORIGIN.label;
	carResults = [];
	ptResults = [];
	error = null;
	result = null;
}

function hitKey(hit: GeocodeResult, index: number): string {
	return `${hit.lat},${hit.lon}:${hit.label}:${index}`;
}

async function useMyLocation(which: "car" | "pt") {
	error = null;
	if (typeof navigator === "undefined" || !navigator.geolocation) {
		error = "Din webbläsare stödjer inte platsinformation.";
		return;
	}
	await new Promise<void>((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const selected = {
					label: "Min position",
					coord: { lat: pos.coords.latitude, lon: pos.coords.longitude },
				};
				if (which === "car") {
					carSelected = selected;
					carQuery = selected.label;
				} else {
					ptSelected = selected;
					ptQuery = selected.label;
				}
				resolve();
			},
			(err) => {
				error = err.message || "Kunde inte hämta din position.";
				resolve();
			},
			{ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
		);
	});
}

$effect(() => {
	const q = carQuery.trim();
	if (carSelected && q === carSelected.label) {
		carResults = [];
		return;
	}
	if (q.length < 3) {
		carResults = [];
		return;
	}
	if (carDebounce) clearTimeout(carDebounce);
	carDebounce = setTimeout(() => {
		void searchGeocode("car", q);
	}, 250);
});

$effect(() => {
	const q = ptQuery.trim();
	if (ptSelected && q === ptSelected.label) {
		ptResults = [];
		return;
	}
	if (q.length < 3) {
		ptResults = [];
		return;
	}
	if (ptDebounce) clearTimeout(ptDebounce);
	ptDebounce = setTimeout(() => {
		void searchGeocode("pt", q);
	}, 250);
});

async function compute() {
	error = null;
	result = null;

	if (!destination) {
		error = "Stugan saknar koordinater.";
		return;
	}
	if (!carSelected) {
		error = "Välj startpunkt för bil-ledare.";
		return;
	}
	if (!ptSelected) {
		error = "Välj startpunkt för gruppen (kollektivtrafik).";
		return;
	}
	const departAt = parseIsoLocalDatetime(departLocal);
	if (!departAt) {
		error = "Välj en giltig avresetid.";
		return;
	}

	loading = true;
	try {
		const res = await fetch("/api/travel", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				mode,
				destination,
				carOrigin: carSelected.coord,
				ptOrigin: ptSelected.coord,
				departAt: departAt.toISOString(),
				originLabels: { car: carSelected.label, pt: ptSelected.label },
				destinationLabel: stuga.platsAdress || stuga.namn,
			}),
		});
		const raw = (await res.json()) as unknown;
		if (!res.ok)
			throw new Error(getErrorFromJson(raw) ?? `Travel failed (${res.status})`);
		result = raw as TravelResponse;
	} catch (e) {
		error = e instanceof Error ? e.message : "Okänt fel vid beräkning.";
	} finally {
		loading = false;
	}
}
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>

<div
	class="panel"
	role="dialog"
	aria-modal="true"
	aria-label="Planera övernattning/hajk"
>
	<header class="header">
		<div class="titleWrap">
			<div class="kicker">Planera övernattning/hajk</div>
			<div class="title">{stuga.namn}</div>
			{#if stuga.platsAdress}
				<div class="subtitle">{stuga.platsAdress}</div>
			{/if}
		</div>
		<button class="close" type="button" onclick={onClose} aria-label="Stäng">✕</button>
	</header>

	{#if !destination}
		<p class="error">Stugan saknar koordinater och går inte att reseplanera automatiskt.</p>
	{:else}
		<div class="grid">
			<div class="field">
				<div class="label">Läge</div>
				<div class="modeRow">
					<label class="mode">
						<input type="radio" bind:group={mode} value="direct" />
						<span>Direkt</span>
					</label>
					<label class="mode modeDisabled" title="Kommer senare">
						<input type="radio" bind:group={mode} value="hike" disabled />
						<span>Vandring (kommer senare)</span>
					</label>
				</div>
			</div>

			<div class="field">
				<label class="label" for="departAt">Avresetid</label>
				<input
					id="departAt"
					class="input inputIso"
					type="text"
					autocomplete="off"
					aria-label="Avresetid"
					bind:this={departInput}
					bind:value={departLocal}
					onblur={() => {
						const parsed = parseIsoLocalDatetime(departLocal);
						if (parsed) departLocal = formatIsoLocalDatetime(parsed);
					}}
				/>
				<div class="hint">Välj datum och tid (lokal tid).</div>
			</div>

			<div class="field">
				<div class="label">Start (bil)</div>
				<div class="searchRow">
					<input
						class="input"
						type="search"
						placeholder="Skriv adress eller plats…"
						bind:value={carQuery}
						oninput={(e) => {
							const value = (e.target as HTMLInputElement).value;
							if (carSelected && value !== carSelected.label) clearOrigin("car");
							carLastEmpty = null;
						}}
						onkeydown={(e) => e.key === "Enter" && searchGeocode("car")}
					/>
					<button class="btn" type="button" onclick={() => searchGeocode("car")} disabled={carSearchLoading}>
						{carSearchLoading ? "Söker…" : "Sök"}
					</button>
					<button class="btnSecondary" type="button" onclick={() => useMyLocation("car")}>
						Min position
					</button>
				</div>
				{#if carSelected}
					<div class="selected">
						Vald: <strong>{carSelected.label}</strong>
						<button class="inlineLink" type="button" onclick={() => clearOrigin("car")}>Byt</button>
					</div>
				{/if}
				{#if carResults.length > 0}
					<ul class="results" aria-label="Förslag (bil)">
						{#each carResults as hit, index (hitKey(hit, index))}
							<li>
								<button class="result" type="button" onclick={() => selectGeocode("car", hit)}>
									{hit.label}
								</button>
							</li>
						{/each}
					</ul>
				{:else if carLastEmpty === carQuery.trim()}
					<div class="hint">Inga träffar.</div>
				{/if}
			</div>

			<div class="field">
				<div class="label">Start (kollektivtrafik)</div>
				<div class="searchRow">
					<input
						class="input"
						type="search"
						placeholder="Skriv adress eller plats…"
						bind:value={ptQuery}
						oninput={(e) => {
							const value = (e.target as HTMLInputElement).value;
							if (ptSelected && value !== ptSelected.label) clearOrigin("pt");
							ptLastEmpty = null;
						}}
						onkeydown={(e) => e.key === "Enter" && searchGeocode("pt")}
					/>
					<button class="btn" type="button" onclick={() => searchGeocode("pt")} disabled={ptSearchLoading}>
						{ptSearchLoading ? "Söker…" : "Sök"}
					</button>
					<button class="btnSecondary" type="button" onclick={() => useMyLocation("pt")}>
						Min position
					</button>
				</div>
				{#if ptSelected}
					<div class="selected">
						Vald: <strong>{ptSelected.label}</strong>
						<button class="inlineLink" type="button" onclick={() => clearOrigin("pt")}>Byt</button>
					</div>
				{/if}
				{#if ptResults.length > 0}
					<ul class="results" aria-label="Förslag (gruppen)">
						{#each ptResults as hit, index (hitKey(hit, index))}
							<li>
								<button class="result" type="button" onclick={() => selectGeocode("pt", hit)}>
									{hit.label}
								</button>
							</li>
						{/each}
					</ul>
				{:else if ptLastEmpty === ptQuery.trim()}
					<div class="hint">Inga träffar.</div>
				{/if}
			</div>

			<div class="actions">
				<button class="primary" type="button" onclick={compute} disabled={loading}>
					{loading ? "Beräknar…" : "Beräkna restider"}
				</button>
				<button class="btnSecondary" type="button" onclick={resetToDefaults} disabled={loading}>
					Återställ standard
				</button>
				<button class="secondary" type="button" onclick={onClose}>Stäng</button>
			</div>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			{#if result}
				<section class="resultWrap" aria-label="Resultat">
					<div class="resultSummary">
						<div class="resultSummaryTop">
							<div>
								<div class="resultKicker">Reseöversikt</div>
								<div class="resultHeadline">{stuga.platsAdress || stuga.namn}</div>
								<div class="resultSub">
									Avgång {formatClock(resultsVm?.carDepartAtIso ?? result.pt.departAt)}
									{#if resultsVm?.deltaText}
										<span class="sep" aria-hidden="true">·</span>
										<span>{resultsVm.deltaText}</span>
									{/if}
								</div>
							</div>
						</div>
						<dl class="summaryGrid">
							<div>
								<dt>Bil (ledare)</dt>
								<dd>{carSelected?.label ?? "—"}</dd>
							</div>
							<div>
								<dt>Grupp (kollektivtrafik)</dt>
								<dd>{ptSelected?.label ?? "—"}</dd>
							</div>
							<div>
								<dt>Mål</dt>
								<dd>{stuga.platsAdress || stuga.namn}</dd>
							</div>
						</dl>
					</div>

					<div class="compareGrid" aria-label="Jämförelse">
						<div class={`compareCard ${resultsVm?.fastest === "car" ? "isFastest" : ""}`}>
							<div class="compareHeader">
								<div class="compareTitle">Bil (ledare)</div>
								{#if resultsVm?.fastest === "car"}
									<span class="badge">Snabbast</span>
								{:else if resultsVm?.fastest === "tie"}
									<span class="badge badgeNeutral">Likvärdigt</span>
								{/if}
							</div>
							<div class="compareValue">{formatDuration(result.car.durationMs)}</div>
							<div class="compareMeta">
								<div>Avgång: {formatClock(resultsVm?.carDepartAtIso ?? null)}</div>
								<div>Ankomst: {formatClock(resultsVm?.carArriveAtIso ?? null)}</div>
								<div>{formatKm(result.car.distanceM)}</div>
							</div>
							{#if result.deepLinks.carGoogleMaps}
								<a class="linkBtn" href={result.deepLinks.carGoogleMaps} target="_blank" rel="noreferrer">
									Öppna rutt
								</a>
							{/if}
						</div>

						<div class={`compareCard ${resultsVm?.fastest === "pt" ? "isFastest" : ""}`}>
							<div class="compareHeader">
								<div class="compareTitle">Kollektivtrafik (gruppen)</div>
								{#if resultsVm?.fastest === "pt"}
									<span class="badge">Snabbast</span>
								{:else if resultsVm?.fastest === "tie"}
									<span class="badge badgeNeutral">Likvärdigt</span>
								{/if}
							</div>
							<div class="compareValue">{formatDuration(result.pt.durationMs)}</div>
							<div class="compareMeta">
								<div>Avgång: {formatClock(result.pt.departAt)}</div>
								<div>Ankomst: {formatClock(result.pt.arriveAt)}</div>
								{#if result.pt.changes !== null}
									<div>Byten: {result.pt.changes}</div>
								{/if}
								{#if resultsVm && (resultsVm.walkDurationMs > 0 || resultsVm.walkDistanceM > 0)}
									<div>
										Gång:
										{#if resultsVm.walkDurationMs > 0}
											<span>{formatDuration(resultsVm.walkDurationMs)}</span>
										{/if}
										{#if resultsVm.walkDistanceM > 0}
											{#if resultsVm.walkDurationMs > 0}<span class="sep">·</span>{/if}
											<span>{formatWalkDistance(resultsVm.walkDistanceM)}</span>
										{/if}
									</div>
								{/if}
							</div>
							{#if result.deepLinks.ptSl}
								<a class="linkBtn" href={result.deepLinks.ptSl} target="_blank" rel="noreferrer">
									Öppna i SL
								</a>
							{/if}
						</div>
					</div>

					<div class="ptDetails" aria-label="Kollektivtrafik, steg för steg">
						<div class="ptDetailsHeader">
							<div class="ptDetailsTitle">Kollektivtrafik, steg för steg</div>
							<div class="ptDetailsMeta">
								<span class="clock">{formatClock(result.pt.departAt)}</span>
								<span class="arrow" aria-hidden="true">→</span>
								<span class="clock">{formatClock(result.pt.arriveAt)}</span>
							</div>
						</div>

						{#if result.pt.legs.length > 0}
							<ol class="ptTimeline" aria-label="Delresor">
								{#each result.pt.legs as leg, idx (idx)}
									<li class="ptLeg">
										<div class="ptLegTime" aria-label="Tider">
											<div class="ptTime">{formatClock(leg.departAt)}</div>
											<div class="ptTime ptTimeMuted">{formatClock(leg.arriveAt)}</div>
										</div>

										<div class="ptLegBody">
											<div class="ptLegTop">
												<span class={`chip chipSmall ${ptChipClass(leg)}`}>{ptChipText(leg)}</span>
												{#if leg.kind === "transit" && leg.direction}
													<span class="ptDirection">mot {leg.direction}</span>
												{/if}
											</div>

											<div class="ptStops">
												<div class="ptStop">
													<span class="dot" aria-hidden="true"></span>
													<span>{leg.fromName ?? "Start"}</span>
												</div>
												<div class="ptStop">
													<span class="dot dotMuted" aria-hidden="true"></span>
													<span>{leg.toName ?? "Mål"}</span>
												</div>
											</div>

											{#if leg.kind === "walk"}
												<div class="ptHint">
													{#if leg.durationMs !== null}
														<span>{Math.round(leg.durationMs / 60_000)} min</span>
													{/if}
													{#if leg.distanceM !== null}
														{#if leg.durationMs !== null}<span class="sep">·</span>{/if}
														<span>{formatWalkDistance(leg.distanceM)}</span>
													{/if}
												</div>
											{/if}
										</div>
									</li>
								{/each}
							</ol>
						{:else}
							<div class="hint">Inga delresor att visa.</div>
						{/if}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(2, 6, 23, 0.42);
		backdrop-filter: blur(4px);
		/* Leaflet controls default to z-index ~1000; keep modal above map UI */
		z-index: 5000;
	}

	.panel {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(900px, calc(100vw - 24px));
		max-height: min(85vh, 760px);
		overflow: auto;
		z-index: 5010;
		border-radius: 18px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 26px 60px rgba(15, 23, 42, 0.22);
	}

	.header {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 16px 10px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.25);
	}

	.kicker {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.02em;
		color: #1d4ed8;
	}

	.title {
		font-weight: 900;
		font-size: 18px;
		letter-spacing: -0.01em;
	}

	.subtitle {
		color: #475569;
		font-size: 13px;
		margin-top: 2px;
	}

	.close {
		border: 1px solid rgba(15, 23, 42, 0.18);
		background: rgba(255, 255, 255, 0.85);
		border-radius: 999px;
		width: 36px;
		height: 36px;
		cursor: pointer;
		font-weight: 900;
	}

	.grid {
		padding: 14px 16px 18px;
		display: grid;
		gap: 14px;
	}

	.field {
		display: grid;
		gap: 8px;
	}

	.label {
		font-size: 12px;
		font-weight: 800;
		color: #334155;
		letter-spacing: 0.02em;
	}

	.input {
		border: 1px solid rgba(15, 23, 42, 0.16);
		border-radius: 12px;
		padding: 10px 12px;
		font-size: 14px;
		background: rgba(255, 255, 255, 0.9);
	}

	.inputIso {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
			"Liberation Mono", "Courier New", monospace;
	}

	.hint {
		font-size: 12px;
		color: #64748b;
	}

	.modeRow {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.mode {
		display: inline-flex;
		gap: 8px;
		align-items: center;
		border: 1px solid rgba(148, 163, 184, 0.45);
		background: rgba(255, 255, 255, 0.75);
		padding: 8px 10px;
		border-radius: 999px;
		font-weight: 800;
		font-size: 13px;
	}

	.modeDisabled {
		opacity: 0.6;
	}

	.searchRow {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		align-items: center;
	}

	.btn,
	.btnSecondary,
	.primary,
	.secondary,
	.linkBtn {
		border-radius: 999px;
		padding: 9px 12px;
		font-weight: 900;
		cursor: pointer;
		border: 1px solid rgba(15, 23, 42, 0.2);
		background: rgba(255, 255, 255, 0.9);
		color: #0f172a;
		font-size: 13px;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.btn:disabled,
	.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btnSecondary {
		background: rgba(15, 23, 42, 0.06);
		border-color: rgba(15, 23, 42, 0.14);
	}

	.actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}

	.primary {
		background: rgba(37, 99, 235, 0.12);
		border-color: rgba(37, 99, 235, 0.35);
		color: #1d4ed8;
	}

	.secondary {
		background: rgba(15, 23, 42, 0.06);
	}

	.selected {
		font-size: 13px;
		color: #334155;
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}

	.inlineLink {
		border: none;
		background: transparent;
		color: #1d4ed8;
		font-weight: 900;
		cursor: pointer;
		padding: 0;
	}

	.results {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid rgba(148, 163, 184, 0.4);
		border-radius: 12px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.85);
	}

	.result {
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-weight: 700;
		color: #0f172a;
	}

	.result:hover {
		background: rgba(37, 99, 235, 0.08);
	}

	.error {
		margin: 0;
		color: #b91c1c;
		font-weight: 800;
	}

	.resultWrap {
		display: grid;
		gap: 16px;
	}

	.resultSummary {
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 16px;
		padding: 14px 16px;
		background: rgba(255, 255, 255, 0.78);
		display: grid;
		gap: 12px;
	}

	.resultSummaryTop {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}

	.resultKicker {
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.02em;
		color: #1d4ed8;
	}

	.resultHeadline {
		font-size: 16px;
		font-weight: 1000;
		letter-spacing: -0.01em;
		color: #0f172a;
	}

	.resultSub {
		font-size: 13px;
		color: #475569;
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: center;
	}

	.summaryGrid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin: 0;
	}

	.summaryGrid dt {
		font-size: 11px;
		font-weight: 900;
		letter-spacing: 0.02em;
		color: #64748b;
	}

	.summaryGrid dd {
		margin: 4px 0 0;
		font-size: 13px;
		font-weight: 800;
		color: #0f172a;
	}

	.compareGrid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.compareCard {
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 16px;
		padding: 14px 14px 12px;
		background: rgba(255, 255, 255, 0.78);
		display: grid;
		gap: 8px;
	}

	.compareCard.isFastest {
		border-color: rgba(37, 99, 235, 0.6);
		box-shadow: 0 10px 24px rgba(37, 99, 235, 0.14);
	}

	.compareHeader {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		align-items: center;
	}

	.compareTitle {
		font-size: 12px;
		font-weight: 900;
		color: #334155;
		letter-spacing: 0.02em;
	}

	.compareValue {
		font-size: 22px;
		font-weight: 1000;
		letter-spacing: -0.02em;
		color: #0f172a;
	}

	.compareMeta {
		display: grid;
		gap: 4px;
		font-size: 13px;
		color: #475569;
	}

	.badge {
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 11px;
		font-weight: 900;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
		border: 1px solid rgba(37, 99, 235, 0.3);
	}

	.badgeNeutral {
		background: rgba(15, 23, 42, 0.06);
		color: #334155;
		border-color: rgba(15, 23, 42, 0.18);
	}

	.ptDetails {
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 16px;
		padding: 14px 14px 12px;
		background: rgba(255, 255, 255, 0.78);
		display: grid;
		gap: 12px;
	}

	.ptDetailsHeader {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: baseline;
	}

	.ptDetailsTitle {
		font-size: 13px;
		font-weight: 900;
		color: #334155;
		letter-spacing: 0.02em;
	}

	.ptDetailsMeta {
		display: inline-flex;
		gap: 8px;
		align-items: center;
		font-weight: 1000;
		letter-spacing: -0.02em;
		color: #0f172a;
	}

	.ptTimeline {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}

	.ptLeg {
		display: grid;
		grid-template-columns: 64px 1fr;
		gap: 12px;
		align-items: start;
		padding: 10px 12px;
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.04);
	}

	.ptLegTime {
		display: grid;
		gap: 4px;
		font-variant-numeric: tabular-nums;
	}

	.ptTime {
		font-weight: 1000;
		color: #0f172a;
	}

	.ptTimeMuted {
		font-weight: 800;
		color: #64748b;
	}

	.ptLegBody {
		display: grid;
		gap: 6px;
		min-width: 0;
	}

	.ptLegTop {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}

	.ptDirection {
		color: #475569;
		font-weight: 800;
		font-size: 13px;
	}

	.ptStops {
		display: grid;
		gap: 4px;
		color: #0f172a;
		font-size: 13px;
	}

	.ptStop {
		display: grid;
		grid-template-columns: 10px 1fr;
		gap: 8px;
		align-items: center;
		min-width: 0;
	}

	.ptHint {
		color: #64748b;
		font-size: 12px;
		font-weight: 800;
		display: inline-flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}

	.sep {
		color: rgba(100, 116, 139, 0.9);
	}

	.resultGrid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.resultCard {
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 16px;
		padding: 14px 14px 12px;
		background: rgba(255, 255, 255, 0.78);
		display: grid;
		gap: 6px;
	}

	.journeyCard {
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 16px;
		padding: 14px 14px 12px;
		background: rgba(255, 255, 255, 0.78);
		display: grid;
		gap: 10px;
	}

	.journeyHeader {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		align-items: baseline;
	}

	.journeyTitle {
		font-size: 12px;
		font-weight: 900;
		color: #334155;
		letter-spacing: 0.02em;
	}

	.journeyTimes {
		display: inline-flex;
		gap: 8px;
		align-items: center;
		font-weight: 1000;
		letter-spacing: -0.02em;
		color: #0f172a;
	}

	.clock {
		font-size: 16px;
	}

	.arrow {
		color: #64748b;
		font-weight: 900;
	}

	.journeyMeta {
		display: flex;
		gap: 10px;
		align-items: baseline;
		flex-wrap: wrap;
		color: #475569;
		font-size: 13px;
	}

	.journeyDuration {
		color: #0f172a;
		font-weight: 1000;
	}

	.journeyChanges {
		font-weight: 800;
	}

	.chipRow {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: center;
	}

	.chipSep {
		color: rgba(100, 116, 139, 0.8);
		font-weight: 900;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 5px 10px;
		font-size: 12px;
		font-weight: 1000;
		border: 1px solid rgba(15, 23, 42, 0.12);
		background: rgba(15, 23, 42, 0.04);
		color: #0f172a;
	}

	.chipSmall {
		padding: 4px 8px;
		font-size: 12px;
	}

	.chipWalk {
		background: rgba(15, 23, 42, 0.06);
		color: #334155;
	}

	.chipTransit {
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
		border-color: rgba(37, 99, 235, 0.25);
	}

	.chipBus {
		background: rgba(16, 185, 129, 0.14);
		color: #047857;
		border-color: rgba(16, 185, 129, 0.25);
	}

	.chipMetro {
		background: rgba(245, 158, 11, 0.16);
		color: #92400e;
		border-color: rgba(245, 158, 11, 0.26);
	}

	.chipTrain {
		background: rgba(99, 102, 241, 0.16);
		color: #3730a3;
		border-color: rgba(99, 102, 241, 0.26);
	}

	.chipTram {
		background: rgba(236, 72, 153, 0.14);
		color: #9d174d;
		border-color: rgba(236, 72, 153, 0.24);
	}

	.chipFerry {
		background: rgba(14, 165, 233, 0.14);
		color: #075985;
		border-color: rgba(14, 165, 233, 0.24);
	}

	.journeyDetails {
		border: 1px solid rgba(148, 163, 184, 0.25);
		border-radius: 14px;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.7);
	}

	.legs {
		list-style: none;
		padding: 10px 0 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}

	.legRow {
		display: grid;
		grid-template-columns: 56px 1fr;
		gap: 10px;
		align-items: start;
	}

	.legLeft {
		display: grid;
		gap: 4px;
		font-variant-numeric: tabular-nums;
	}

	.legTime {
		font-weight: 1000;
		color: #0f172a;
	}

	.legTimeMuted {
		font-weight: 800;
		color: #64748b;
	}

	.legBody {
		display: grid;
		gap: 6px;
		min-width: 0;
	}

	.legTop {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}

	.legDirection {
		color: #475569;
		font-weight: 800;
		font-size: 13px;
	}

	.legStops {
		display: grid;
		gap: 4px;
		color: #0f172a;
		font-size: 13px;
	}

	.legStop {
		display: grid;
		grid-template-columns: 10px 1fr;
		gap: 8px;
		align-items: center;
		min-width: 0;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #1d4ed8;
	}

	.dotMuted {
		background: rgba(15, 23, 42, 0.2);
	}

	.legHint {
		color: #64748b;
		font-size: 12px;
		font-weight: 800;
		display: inline-flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}

	.legHint .sep {
		color: rgba(100, 116, 139, 0.9);
	}

	.resultTitle {
		font-size: 12px;
		font-weight: 900;
		color: #334155;
		letter-spacing: 0.02em;
	}

	.resultValue {
		font-size: 20px;
		font-weight: 1000;
		letter-spacing: -0.02em;
	}

	.resultMeta {
		font-size: 13px;
		color: #475569;
		min-height: 18px;
	}

	.linkBtn {
		margin-top: 4px;
		width: fit-content;
		background: rgba(15, 23, 42, 0.06);
	}

	@media (max-width: 720px) {
		.searchRow {
			grid-template-columns: 1fr;
		}
		.summaryGrid {
			grid-template-columns: 1fr;
		}
		.compareGrid {
			grid-template-columns: 1fr;
		}
		.ptDetailsHeader {
			flex-direction: column;
			align-items: flex-start;
		}
		.ptLeg {
			grid-template-columns: 56px 1fr;
		}
		.resultGrid {
			grid-template-columns: 1fr;
		}
	}
</style>


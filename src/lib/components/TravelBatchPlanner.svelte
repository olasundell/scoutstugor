<script lang="ts">
import { onMount } from "svelte";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import type { Scoutstuga } from "$lib/scoutstugor";
import type { GeocodeResult } from "$lib/server/travel/graphhopper";
import { DEFAULT_PT_ORIGIN } from "$lib/travel/defaultOrigins";
import {
	formatIsoLocalDatetime,
	parseIsoLocalDatetime,
} from "$lib/travel/isoLocalDatetime";
import type { TravelMode } from "$lib/travel/types";

type BatchTimes = Record<
	string,
	{
		pt: {
			durationMs: number;
			departAt: string;
			arriveAt: string;
			changes: number | null;
		};
	}
>;

let {
	stugor,
	onResults,
}: {
	stugor: Scoutstuga[];
	onResults: (times: BatchTimes) => void;
} = $props();

const withCoords = $derived.by(() =>
	stugor.filter((s) => s.latitud !== null && s.longitud !== null),
);

let open = $state(false);
let mode = $state<TravelMode>("direct");

let ptQuery = $state(DEFAULT_PT_ORIGIN.label);
let ptSelected = $state<{ label: string; lat: number; lon: number } | null>({
	label: DEFAULT_PT_ORIGIN.label,
	lat: DEFAULT_PT_ORIGIN.coord.lat,
	lon: DEFAULT_PT_ORIGIN.coord.lon,
});
let ptResults = $state<GeocodeResult[]>([]);
let ptSearchLoading = $state(false);
let ptDebounce: ReturnType<typeof setTimeout> | null = null;
let departLocal = $state(defaultDepartLocal());
let departInput = $state<HTMLInputElement | null>(null);
let departPicker: flatpickr.Instance | null = null;

let loading = $state(false);
let error = $state<string | null>(null);

type BatchApiResult = {
	id: string;
	pt: {
		durationMs: number;
		departAt: string;
		arriveAt: string;
		changes: number | null;
	};
};

function defaultDepartLocal(): string {
	const now = new Date();
	const day = now.getDay();
	const daysUntilSat = (6 - day + 7) % 7 || 7;
	const d = new Date(now);
	d.setDate(now.getDate() + daysUntilSat);
	d.setHours(9, 0, 0, 0);
	return formatIsoLocalDatetime(d);
}

function getErrorFromJson(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	const maybe = value as { error?: unknown };
	return typeof maybe.error === "string" ? maybe.error : null;
}

async function searchGeocode(query?: string) {
	const q = (query ?? ptQuery).trim();
	if (!q) return;

	ptSearchLoading = true;
	ptResults = [];

	try {
		const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=6`);
		const raw = (await res.json()) as unknown;
		if (!res.ok)
			throw new Error(
				getErrorFromJson(raw) ?? `Geocode failed (${res.status})`,
			);
		const data = raw as { results?: GeocodeResult[] };
		ptResults = data.results ?? [];
	} catch (e) {
		error = e instanceof Error ? e.message : "Okänt fel vid geokodning.";
	} finally {
		ptSearchLoading = false;
	}
}

function selectGeocode(hit: GeocodeResult) {
	const selected = { label: hit.label, lat: hit.lat, lon: hit.lon };
	ptSelected = selected;
	ptQuery = selected.label;
	ptResults = [];
}

function clearOrigin() {
	ptSelected = null;
	ptResults = [];
}

function resetToDefaults() {
	ptSelected = {
		label: DEFAULT_PT_ORIGIN.label,
		lat: DEFAULT_PT_ORIGIN.coord.lat,
		lon: DEFAULT_PT_ORIGIN.coord.lon,
	};
	ptQuery = DEFAULT_PT_ORIGIN.label;
	ptResults = [];
	error = null;
}

function hitKey(hit: GeocodeResult, index: number): string {
	return `${hit.lat},${hit.lon}:${hit.label}:${index}`;
}

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
		void searchGeocode(q);
	}, 250);
});

const handleKeydown = (event: KeyboardEvent) => {
	if (event.key !== "Escape") return;
	if (!open) return;
	event.preventDefault();
	open = false;
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

async function computeBatch() {
	error = null;
	if (mode === "hike") {
		error = "Vandring kommer senare.";
		return;
	}
	if (!ptSelected) {
		error = "Välj en startpunkt för kollektivtrafik.";
		return;
	}
	const departAt = parseIsoLocalDatetime(departLocal);
	if (!departAt) {
		error = "Välj en giltig avresetid.";
		return;
	}
	if (withCoords.length === 0) {
		error = "Inga stugor med koordinater i urvalet.";
		return;
	}

	loading = true;
	try {
		const res = await fetch("/api/travel/batch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				mode,
				departAt: departAt.toISOString(),
				ptOrigin: { lat: ptSelected.lat, lon: ptSelected.lon },
				destinations: withCoords.map((s) => ({
					id: s.id,
					lat: s.latitud,
					lon: s.longitud,
				})),
			}),
		});

		const raw = (await res.json()) as unknown;
		if (!res.ok)
			throw new Error(getErrorFromJson(raw) ?? `Batch failed (${res.status})`);
		const data = raw as { results?: BatchApiResult[] };

		const map: BatchTimes = {};
		for (const r of data.results ?? []) {
			if (!r || typeof r.id !== "string") continue;
			map[r.id] = { pt: r.pt };
		}
		onResults(map);
		open = false;
	} catch (e) {
		error = e instanceof Error ? e.message : "Okänt fel vid batch-beräkning.";
	} finally {
		loading = false;
	}
}
</script>

<div class="bar">
	<button class="btn" type="button" onclick={() => (open = true)} disabled={withCoords.length === 0}>
		Beräkna restider (kollektivtrafik) ({withCoords.length})
	</button>
	<p class="hint">
		{#if withCoords.length === 0}
			Inga koordinater i urvalet.
		{:else}
			Beräknar kollektivtrafik för alla stugor i urvalet med koordinater.
		{/if}
	</p>
</div>

{#if open}
	<div class="backdrop" role="presentation" onclick={() => (open = false)}></div>
	<div class="panel" role="dialog" aria-modal="true" aria-label="Beräkna restider för urval">
		<header class="header">
			<div class="title">Beräkna restider för urval</div>
			<button class="close" type="button" onclick={() => (open = false)} aria-label="Stäng">✕</button>
		</header>

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
				<label class="label" for="departAtBatch">Avresetid</label>
				<input
					id="departAtBatch"
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
				<div class="hintIso">Välj datum och tid (lokal tid).</div>
			</div>

			<div class="field">
				<div class="label">Start (gruppen, kollektivtrafik)</div>
				<div class="searchRow">
					<input
						class="input"
						type="search"
						placeholder="Skriv adress eller plats…"
						bind:value={ptQuery}
						oninput={(e) => {
							const value = (e.target as HTMLInputElement).value;
							if (ptSelected && value !== ptSelected.label) clearOrigin();
						}}
						onkeydown={(e) => e.key === "Enter" && searchGeocode()}
					/>
					<button
						class="btnSmall"
						type="button"
						onclick={() => searchGeocode()}
						disabled={ptSearchLoading}
					>
						{ptSearchLoading ? "Söker…" : "Sök"}
					</button>
				</div>
				{#if ptSelected}
					<div class="selected">
						Vald: <strong>{ptSelected.label}</strong>
						<button class="inlineLink" type="button" onclick={() => clearOrigin()}>
							Byt
						</button>
					</div>
				{/if}
				{#if ptResults.length > 0}
					<ul class="results" aria-label="Förslag (gruppen)">
						{#each ptResults as hit, index (hitKey(hit, index))}
							<li>
								<button class="result" type="button" onclick={() => selectGeocode(hit)}>
									{hit.label}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="actions">
				<button class="primary" type="button" onclick={computeBatch} disabled={loading}>
					{loading ? "Beräknar…" : `Beräkna (${withCoords.length})`}
				</button>
				<button class="btnSmall" type="button" onclick={resetToDefaults} disabled={loading}>
					Återställ standard
				</button>
				<button class="secondary" type="button" onclick={() => (open = false)}>Avbryt</button>
			</div>

			{#if error}
				<p class="error">{error}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.bar {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}

	.hint {
		margin: 0;
		color: #475569;
		font-size: 13px;
	}

	.btn {
		border: 1px solid rgba(15, 23, 42, 0.2);
		border-radius: 999px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		font-weight: 800;
		color: #0f172a;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

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

	.title {
		font-weight: 1000;
		font-size: 18px;
		letter-spacing: -0.01em;
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
		font-weight: 900;
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

	.hintIso {
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
		font-weight: 900;
		font-size: 13px;
	}

	.modeDisabled {
		opacity: 0.6;
	}

	.searchRow {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: center;
	}

	.btnSmall,
	.primary,
	.secondary {
		border-radius: 999px;
		padding: 9px 12px;
		font-weight: 900;
		cursor: pointer;
		border: 1px solid rgba(15, 23, 42, 0.2);
		background: rgba(255, 255, 255, 0.9);
		color: #0f172a;
		font-size: 13px;
	}

	.btnSmall:disabled,
	.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
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
		font-weight: 800;
		color: #0f172a;
	}

	.result:hover {
		background: rgba(37, 99, 235, 0.08);
	}

	.error {
		margin: 0;
		color: #b91c1c;
		font-weight: 900;
	}

	@media (max-width: 720px) {
		.searchRow {
			grid-template-columns: 1fr;
		}
	}
</style>


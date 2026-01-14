<script lang="ts">
import OsmMap from "$lib/components/OsmMap.svelte";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

let query = $state("");
let selectedKommun = $state("");
let selectedTyp = $state("");
let focusedId = $state<string | null>(null);

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

const filtered = $derived.by(() => {
	const q = query.trim().toLowerCase();
	return data.stugor.filter((stuga) => {
		if (selectedKommun && stuga.kommun !== selectedKommun) return false;
		if (selectedTyp && stuga.typ !== selectedTyp) return false;

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
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();

		return haystack.includes(q);
	});
});

const filteredWithCoordinates = $derived.by(() =>
	filtered.filter((stuga) => stuga.latitud !== null && stuga.longitud !== null),
);

function resetFilters() {
	query = "";
	selectedKommun = "";
	selectedTyp = "";
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
</script>

<svelte:head>
	<title>Scoutstugor i Stockholms län</title>
	<meta
		name="description"
		content="Lista över scoutstugor i Stockholms län med filtrering och kontaktuppgifter."
	/>
</svelte:head>

<main class="page">
	<header class="hero">
		<h1>Scoutstugor i Stockholms län</h1>
		<p class="subtitle">
			Filtrera och sök i masterlistan. Data kommer från
			<code>scoutstugor_stockholms_lan_masterlista_med_koordinater_semikolon.csv</code>.
		</p>
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
	</section>

	<section class="mapSection" aria-label="Karta" id="karta">
		<div class="mapHeader">
			<h2 class="mapTitle">Karta</h2>
			<p class="mapSubtitle">
				Visar {filteredWithCoordinates.length} av {filtered.length} i urvalet med koordinater
				(OpenStreetMap).
			</p>
		</div>
		<OsmMap stugor={filtered} focusedId={focusedId} />
		{#if filteredWithCoordinates.length === 0}
			<p class="mapHint">Inga koordinater i urvalet ännu.</p>
		{/if}
	</section>

	{#if filtered.length === 0}
		<p class="empty">Inga träffar. Prova att ändra sökning eller filter.</p>
	{:else}
		<ul class="list" aria-label="Scoutstugor">
			{#each filtered as stuga (stuga.id)}
				<li class="card">
					<div class="cardHeader">
						<h2 class="name">{stuga.namn}</h2>
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

					<div class="actions">
						{#if stuga.latitud !== null && stuga.longitud !== null}
							<button class="actionButton" type="button" onclick={() => focusOnMap(stuga.id)}>
								Visa på karta
							</button>
							<a
								class="actionLink"
								href={openInOsm(stuga)}
								target="_blank"
								rel="noreferrer"
							>
								Öppna i OpenStreetMap
							</a>
							{#if stuga.noggrannhet}
								<span class="accuracy">{stuga.noggrannhet}</span>
							{/if}
						{:else}
							<span class="noCoords">Saknar koordinater</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.page {
		min-height: 100vh;
		padding: 32px 16px 64px;
		background: radial-gradient(1200px circle at 15% 0%, #eef3ff 0%, #f7f8fb 55%, #ffffff 100%);
		color: #0f172a;
		font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
			"Noto Sans", "Liberation Sans", sans-serif;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
			"Courier New", monospace;
		font-size: 0.95em;
	}

	.hero {
		max-width: 1100px;
		margin: 0 auto 28px;
	}

	h1 {
		margin: 0 0 8px;
		font-size: clamp(26px, 4vw, 40px);
		letter-spacing: -0.02em;
	}

	.subtitle {
		margin: 0;
		color: #334155;
		line-height: 1.45;
	}

	.filters {
		max-width: 1100px;
		margin: 0 auto 18px;
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

	.mapSection {
		max-width: 1100px;
		margin: 0 auto 20px;
		display: grid;
		gap: 10px;
	}

	.mapHeader {
		display: flex;
		gap: 12px;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
	}

	.mapTitle {
		margin: 0;
		font-size: 16px;
		letter-spacing: -0.01em;
	}

	.mapSubtitle {
		margin: 0;
		color: #475569;
		font-size: 13px;
	}

	.mapHint {
		margin: 0;
		color: #64748b;
		font-size: 13px;
	}

	.list {
		list-style: none;
		padding: 0;
		margin: 0 auto;
		max-width: 1100px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 14px;
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

	.name {
		margin: 0;
		font-size: 18px;
		letter-spacing: -0.01em;
	}

	.badges {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
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

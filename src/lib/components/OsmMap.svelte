<script lang="ts">
import type { DivIcon, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { onMount } from "svelte";
import scoutLilja from "$lib/assets/scoutlilja.png";
import type { Scoutstuga } from "$lib/scoutstugor";

let {
	stugor,
	focusedId,
}: {
	stugor: Scoutstuga[];
	focusedId?: string | null;
} = $props();

let container: HTMLDivElement | null = $state(null);

let leaflet: typeof import("leaflet") | null = null;
let map: LeafletMap | null = null;
let markersLayer: LayerGroup | null = null;
let scoutIcon: DivIcon | null = null;
let didFitBounds = false;

const markersById = new Map<string, Marker>();

function getLatLng(stuga: Scoutstuga): [number, number] | null {
	if (stuga.latitud === null || stuga.longitud === null) return null;
	return [stuga.latitud, stuga.longitud];
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function buildPopupHtml(stuga: Scoutstuga): string {
	const name = escapeHtml(stuga.namn || "Scoutstuga");
	const kommun = stuga.kommun
		? `<div class="popupMeta">${escapeHtml(stuga.kommun)}</div>`
		: "";
	const typ = stuga.typ
		? `<div class="popupMeta">${escapeHtml(stuga.typ)}</div>`
		: "";
	const plats = stuga.platsAdress
		? `<div class="popupMeta">${escapeHtml(stuga.platsAdress)}</div>`
		: "";
	const mail = stuga.epostadresser[0]
		? `<a class="popupLink" href="mailto:${encodeURIComponent(
				stuga.epostadresser[0],
			)}">${escapeHtml(stuga.epostadresser[0])}</a>`
		: "";

	return `<div class="popup">
<div class="popupTitle">${name}</div>
${kommun}
${typ}
${plats}
${mail}
</div>`;
}

function updateMarkers() {
	if (!leaflet || !map || !markersLayer || !scoutIcon) return;

	markersLayer.clearLayers();
	markersById.clear();

	for (const stuga of stugor) {
		const latLng = getLatLng(stuga);
		if (!latLng) continue;

		const marker = leaflet.marker(latLng, {
			title: stuga.namn,
			icon: scoutIcon,
		});
		marker.bindPopup(buildPopupHtml(stuga));
		marker.addTo(markersLayer);
		markersById.set(stuga.id, marker);
	}
}

function fitToMarkers() {
	if (!leaflet || !map) return;

	const latLngs = stugor
		.map(getLatLng)
		.filter((value): value is [number, number] => value !== null);

	if (latLngs.length === 0) {
		map.setView([59.3293, 18.0686], 9);
		return;
	}

	const bounds = leaflet.latLngBounds(latLngs);
	map.fitBounds(bounds.pad(0.15), { maxZoom: 14 });
}

onMount(() => {
	let cancelled = false;

	async function init() {
		if (!container) return;

		const imported = await import("leaflet");
		if (cancelled) return;

		leaflet = imported;
		scoutIcon = leaflet.divIcon({
			className: "scoutMarker",
			html: `<div class="scoutMarkerInner"><img src="${scoutLilja}" alt="" /></div>`,
			iconSize: [34, 34],
			iconAnchor: [17, 17],
			popupAnchor: [0, -17],
		});

		map = leaflet.map(container, {
			center: [59.3293, 18.0686],
			zoom: 9,
			scrollWheelZoom: false,
		});

		leaflet
			.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				maxZoom: 19,
			})
			.addTo(map);

		markersLayer = leaflet.layerGroup().addTo(map);
		updateMarkers();
		fitToMarkers();
		didFitBounds = true;
	}

	void init();

	return () => {
		cancelled = true;
		map?.remove();
		map = null;
		markersLayer = null;
		leaflet = null;
		scoutIcon = null;
		markersById.clear();
	};
});

$effect(() => {
	if (!map || !markersLayer || !leaflet) return;
	updateMarkers();
	if (!didFitBounds) {
		fitToMarkers();
		didFitBounds = true;
	}
});

$effect(() => {
	if (!focusedId || !map) return;
	const marker = markersById.get(focusedId);
	if (!marker) return;
	marker.openPopup();
	map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13), {
		animate: true,
	});
});
</script>

<div class="map" bind:this={container} aria-label="Karta (OpenStreetMap)"></div>

<style>
.map {
	height: 420px;
	width: 100%;
	border-radius: 18px;
	border: 1px solid rgba(148, 163, 184, 0.4);
	box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
	overflow: hidden;
	background: rgba(255, 255, 255, 0.8);
}

:global(.leaflet-control-attribution) {
	font-size: 11px;
}

:global(.scoutMarker) {
	background: transparent;
	border: none;
}

:global(.scoutMarkerInner) {
	width: 100%;
	height: 100%;
	border-radius: 999px;
	display: grid;
	place-items: center;
	background: rgba(255, 255, 255, 0.95);
	border: 2px solid rgba(29, 78, 216, 0.55);
	box-shadow: 0 10px 18px rgba(15, 23, 42, 0.18);
}

:global(.scoutMarkerInner img) {
	width: 62%;
	height: 62%;
}

:global(.popup) {
	display: grid;
	gap: 6px;
	font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
		"Noto Sans", "Liberation Sans", sans-serif;
}

:global(.popupTitle) {
	font-weight: 800;
	font-size: 14px;
}

:global(.popupMeta) {
	font-size: 12px;
	color: #334155;
}

:global(.popupLink) {
	font-size: 12px;
	color: #1d4ed8;
	text-decoration: none;
	word-break: break-word;
}

:global(.popupLink:hover) {
	text-decoration: underline;
}
</style>

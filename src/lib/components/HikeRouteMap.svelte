<script lang="ts">
import type { LatLon } from "$lib/travel/types";
import { onMount } from "svelte";

let { route }: { route: LatLon[] } = $props();

let container: HTMLDivElement | null = $state(null);
let leaflet: typeof import("leaflet") | null = null;
let map: import("leaflet").Map | null = null;
let polyline: import("leaflet").Polyline | null = null;
let markers: import("leaflet").LayerGroup | null = null;

function toLatLngs(points: LatLon[]): [number, number][] {
	return points.map((p) => [p.lat, p.lon]);
}

function updateRoute() {
	if (!leaflet || !map || !markers) return;
	markers.clearLayers();

	if (polyline) {
		polyline.remove();
		polyline = null;
	}

	if (!route || route.length < 2) return;
	const latLngs = toLatLngs(route);
	polyline = leaflet
		.polyline(latLngs, {
			color: "#2563eb",
			weight: 3,
			opacity: 0.9,
		})
		.addTo(map);

	const start = route[0];
	const end = route[route.length - 1];
	if (start) leaflet.marker([start.lat, start.lon]).addTo(markers);
	if (end) leaflet.marker([end.lat, end.lon]).addTo(markers);

	const bounds = leaflet.latLngBounds(latLngs);
	map.fitBounds(bounds.pad(0.2), { maxZoom: 15 });
}

onMount(() => {
	let cancelled = false;

	async function init() {
		if (!container) return;
		const imported = await import("leaflet");
		if (cancelled) return;
		leaflet = imported;

		map = leaflet.map(container, {
			center: [59.3293, 18.0686],
			zoom: 10,
			scrollWheelZoom: false,
		});

		leaflet
			.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				maxZoom: 19,
			})
			.addTo(map);

		markers = leaflet.layerGroup().addTo(map);
		updateRoute();
	}

	void init();

	return () => {
		cancelled = true;
		polyline?.remove();
		polyline = null;
		markers?.clearLayers();
		markers = null;
		map?.remove();
		map = null;
		leaflet = null;
	};
});

$effect(() => {
	if (!map || !leaflet) return;
	updateRoute();
});
</script>

<div class="map" bind:this={container} aria-label="Hajkrutt (OpenStreetMap)"></div>

<style>
	.map {
		height: 260px;
		width: 100%;
		border-radius: 16px;
		border: 1px solid rgba(148, 163, 184, 0.4);
		box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
		overflow: hidden;
		background: rgba(255, 255, 255, 0.8);
	}
</style>

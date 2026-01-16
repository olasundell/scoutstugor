<script lang="ts">
import type {
	DivIcon,
	LayerGroup,
	Map as LeafletMap,
	Marker,
	Popup,
} from "leaflet";
import { onMount } from "svelte";
import scoutLilja from "$lib/assets/scoutlilja.png";
import type { Scoutstuga } from "$lib/scoutstugor";

let {
	stugor,
	focusedId,
	onSelect,
}: {
	stugor: Scoutstuga[];
	focusedId?: string | null;
	onSelect?: (id: string) => void;
} = $props();

let container: HTMLDivElement | null = $state(null);

let leaflet: typeof import("leaflet") | null = null;
let map: LeafletMap | null = null;
let markersLayer: LayerGroup | null = null;
let scoutIcon: DivIcon | null = null;
let didFitBounds = false;
let lastCoordsCount = 0;

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

function panPopupToTop(popup: Popup) {
	if (!map) return;
	const container = map.getContainer();
	const popupEl = popup.getElement();
	if (!popupEl) return;

	requestAnimationFrame(() => {
		if (!map) return;
		const containerRect = container.getBoundingClientRect();
		const popupRect = popupEl.getBoundingClientRect();
		const desiredTop = containerRect.top + 12;
		const delta = popupRect.top - desiredTop;
		if (Math.abs(delta) < 1) return;
		map.panBy([0, delta], { animate: true });
	});
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
		marker.on("click", () => {
			onSelect?.(stuga.id);
		});
		marker.addTo(markersLayer);
		markersById.set(stuga.id, marker);
	}
}

function countCoords(): number {
	return stugor.reduce(
		(acc, s) => acc + (s.latitud !== null && s.longitud !== null ? 1 : 0),
		0,
	);
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
	let cmdWheelCleanup: (() => void) | null = null;

	async function init() {
		if (!container) return;

		const imported = await import("leaflet");
		if (cancelled) return;

		leaflet = imported;
		scoutIcon = leaflet.divIcon({
			className: "scoutMarker",
			html: `<div class="scoutMarkerInner"><img src="${scoutLilja}" alt="" /></div>`,
			iconSize: [28, 28],
			iconAnchor: [14, 14],
			popupAnchor: [0, -14],
		});

		map = leaflet.map(container, {
			center: [59.3293, 18.0686],
			zoom: 9,
			scrollWheelZoom: false,
		});

		map.on("popupopen", (event) => {
			panPopupToTop(event.popup);
		});

		// Cmd/Ctrl + scroll should zoom the map.
		// Note: Trackpad pinch-to-zoom is often delivered as WheelEvent with ctrlKey=true.
		// We keep normal scroll-wheel zoom disabled to avoid accidental zooming while scrolling the page.
		{
			const el = map.getContainer();
			let accumulated = 0;
			let rafPending = false;
			// Trackpads emit many small deltas; keep this fairly low so pinch/Cmd+scroll feels responsive.
			const threshold = 20;
			const onWheel = (event: WheelEvent) => {
				if (!map) return;
				if (!event.metaKey && !event.ctrlKey) return; // only Cmd/Ctrl+scroll (or pinch)

				// Prevent browser page zoom while hovering the map.
				event.preventDefault();
				// Prevent Leaflet or other listeners from handling this wheel.
				event.stopPropagation();

				accumulated += event.deltaY;
				if (rafPending) return;
				rafPending = true;

				// Accumulate deltas and apply discrete zoom steps once per frame.
				requestAnimationFrame(() => {
					rafPending = false;
					if (!map) return;
					while (Math.abs(accumulated) >= threshold) {
						const direction = Math.sign(accumulated);
						if (direction > 0) map.zoomOut(1, { animate: false });
						else map.zoomIn(1, { animate: false });
						accumulated -= direction * threshold;
					}
				});
			};
			// Capture so we run before Leaflet's own wheel handlers.
			el.addEventListener("wheel", onWheel, { passive: false, capture: true });
			cmdWheelCleanup = () =>
				el.removeEventListener("wheel", onWheel, {
					capture: true,
				} as EventListenerOptions);
		}

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
		lastCoordsCount = countCoords();
		// Only consider "fit done" if we actually had coords to fit.
		didFitBounds = lastCoordsCount > 0;
	}

	void init();

	return () => {
		cancelled = true;
		cmdWheelCleanup?.();
		cmdWheelCleanup = null;
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
	const coordsCount = countCoords();
	// If we mounted before data arrived (0 coords -> later >0), fit once when coords appear.
	if (!didFitBounds && coordsCount > 0) {
		fitToMarkers();
		didFitBounds = true;
	}
	lastCoordsCount = coordsCount;
});

$effect(() => {
	if (!focusedId || !map) return;
	const marker = markersById.get(focusedId);
	if (!marker) return;
	map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13), {
		animate: true,
	});
	marker.openPopup();
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
	overflow: hidden;
	background: rgba(255, 255, 255, 0.6);
	border: 1px solid rgba(29, 78, 216, 0.6);
	box-shadow: 0 6px 10px rgba(15, 23, 42, 0.14);
	box-sizing: border-box;
}

:global(.scoutMarkerInner img) {
	display: block;
	width: calc(90% + 1.8px) !important;
	height: calc(90% + 1.8px) !important;
	max-width: 100% !important;
	max-height: 100% !important;
	object-fit: contain;
	pointer-events: none;
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

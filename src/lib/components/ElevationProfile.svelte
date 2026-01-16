<script lang="ts">
export type ElevationPoint = {
	distanceM: number;
	elevationM: number;
};

let { points }: { points: ElevationPoint[] } = $props();

const width = 420;
const height = 120;
const padding = 8;

const stats = $derived.by(() => {
	if (!points || points.length < 2) {
		return {
			path: "",
			minElevation: 0,
			maxElevation: 0,
			totalDistance: 0,
		};
	}
	const distances = points.map((p) => p.distanceM);
	const elevations = points.map((p) => p.elevationM);
	const maxDistance = Math.max(...distances);
	const minElevation = Math.min(...elevations);
	const maxElevation = Math.max(...elevations);

	const innerWidth = width - padding * 2;
	const innerHeight = height - padding * 2;
	const elevationRange = maxElevation - minElevation || 1;

	const path = points
		.map((point, index) => {
			const x = padding + (point.distanceM / maxDistance) * innerWidth;
			const normalized = (point.elevationM - minElevation) / elevationRange;
			const y = padding + (1 - normalized) * innerHeight;
			return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
		})
		.join(" ");

	return {
		path,
		minElevation,
		maxElevation,
		totalDistance: maxDistance,
	};
});
</script>

<div class="profileWrap">
	{#if stats.path}
		<svg
			class="profileSvg"
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label="Höjdprofil"
		>
			<path class="profileLine" d={stats.path}></path>
		</svg>
		<div class="profileMeta">
			<span>Min {Math.round(stats.minElevation)} m</span>
			<span>Max {Math.round(stats.maxElevation)} m</span>
		</div>
	{:else}
		<div class="profileEmpty">Höjdprofil saknas.</div>
	{/if}
</div>

<style>
	.profileWrap {
		display: grid;
		gap: 6px;
	}

	.profileSvg {
		width: 100%;
		height: 120px;
		background: rgba(15, 23, 42, 0.04);
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.35);
	}

	.profileLine {
		fill: none;
		stroke: rgba(37, 99, 235, 0.85);
		stroke-width: 2;
	}

	.profileMeta {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		font-size: 12px;
		color: #475569;
		font-weight: 700;
	}

	.profileEmpty {
		font-size: 12px;
		color: #64748b;
	}
</style>

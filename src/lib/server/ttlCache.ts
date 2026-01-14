export type TtlCacheEntry<V> = {
	value: V;
	expiresAt: number;
};

/**
 * Tiny in-memory TTL cache for server routes.
 * Note: memory is per-process (not shared across instances).
 */
export class TtlCache<K, V> {
	#store = new Map<K, TtlCacheEntry<V>>();
	#lastSweepAt = 0;

	constructor(
		private readonly options: {
			defaultTtlMs: number;
			sweepIntervalMs?: number;
		},
	) {}

	get(key: K, now = Date.now()): V | undefined {
		const entry = this.#store.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt <= now) {
			this.#store.delete(key);
			return undefined;
		}
		this.#maybeSweep(now);
		return entry.value;
	}

	set(
		key: K,
		value: V,
		ttlMs = this.options.defaultTtlMs,
		now = Date.now(),
	): void {
		this.#store.set(key, { value, expiresAt: now + ttlMs });
		this.#maybeSweep(now);
	}

	clear(): void {
		this.#store.clear();
		this.#lastSweepAt = 0;
	}

	#maybeSweep(now: number) {
		const interval = this.options.sweepIntervalMs ?? 30_000;
		if (now - this.#lastSweepAt < interval) return;
		this.#lastSweepAt = now;

		for (const [key, entry] of this.#store.entries()) {
			if (entry.expiresAt <= now) this.#store.delete(key);
		}
	}
}

export function bucketIsoDateTime(iso: string, bucketMinutes: number): string {
	const ms = Date.parse(iso);
	if (!Number.isFinite(ms)) return iso;
	const bucketMs = bucketMinutes * 60_000;
	const floored = Math.floor(ms / bucketMs) * bucketMs;
	return new Date(floored).toISOString();
}

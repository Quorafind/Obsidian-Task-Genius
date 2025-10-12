import { App } from "obsidian";

const STORAGE_KEY = "task-genius-changelog-cache";

type CacheChannel = "stable" | "beta";

interface ChangelogCacheEntry {
	version: string;
	markdown: string;
	sourceUrl: string;
	updatedAt: number;
}

interface ChangelogCachePayload {
	stable?: ChangelogCacheEntry;
	beta?: ChangelogCacheEntry;
}

const getChannelKey = (isBeta: boolean): CacheChannel =>
	isBeta ? "beta" : "stable";

const isChangelogCacheEntry = (
	value: unknown,
): value is ChangelogCacheEntry => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const entry = value as Partial<ChangelogCacheEntry>;
	return (
		typeof entry.version === "string" &&
		typeof entry.markdown === "string" &&
		typeof entry.sourceUrl === "string" &&
		typeof entry.updatedAt === "number"
	);
};

const sanitizeCachePayload = (value: unknown): ChangelogCachePayload => {
	if (!value) {
		return {};
	}

	let payloadCandidate: unknown = value;

	if (typeof payloadCandidate === "string") {
		try {
			payloadCandidate = JSON.parse(payloadCandidate);
		} catch {
			return {};
		}
	}

	if (!payloadCandidate || typeof payloadCandidate !== "object") {
		return {};
	}

	const payload = payloadCandidate as Partial<Record<CacheChannel, unknown>>;
	const sanitized: ChangelogCachePayload = {};

	if (isChangelogCacheEntry(payload.stable)) {
		sanitized.stable = payload.stable;
	}

	if (isChangelogCacheEntry(payload.beta)) {
		sanitized.beta = payload.beta;
	}

	return sanitized;
};

const getStorage = (): Storage | null => {
	try {
		if (typeof window === "undefined") {
			return null;
		}

		return window.localStorage ?? null;
	} catch {
		return null;
	}
};

const loadCache = (app: App): ChangelogCachePayload => {
	try {
		const raw = app.loadLocalStorage(STORAGE_KEY);
		if (!raw) {
			return {};
		}

		console.log("[ChangelogCache]", raw);

		return sanitizeCachePayload(raw);
	} catch (error) {
		console.warn(
			"[ChangelogCache] Failed to load via app localStorage",
			error,
		);
	}

	const storage = getStorage();
	if (!storage) {
		return {};
	}

	try {
		const raw = storage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}

		return sanitizeCachePayload(JSON.parse(raw));
	} catch (error) {
		console.warn(
			"[ChangelogCache] Failed to load via window localStorage",
			error,
		);
		return {};
	}
};

const saveCache = (cache: ChangelogCachePayload, app: App): void => {
	try {
		const serialized =
			!cache.stable && !cache.beta ? "{}" : JSON.stringify(cache);
		app.saveLocalStorage(STORAGE_KEY, serialized);
		return;
	} catch (error) {
		console.warn(
			"[ChangelogCache] Failed to save via app localStorage",
			error,
		);
	}

	const storage = getStorage();
	if (!storage) {
		return;
	}

	try {
		if (!cache.stable && !cache.beta) {
			storage.removeItem(STORAGE_KEY);
			return;
		}

		storage.setItem(STORAGE_KEY, JSON.stringify(cache));
	} catch (error) {
		console.warn(
			"[ChangelogCache] Failed to save via window localStorage",
			error,
		);
	}
};

export const getCachedChangelog = (
	version: string,
	isBeta: boolean,
	app: App,
): ChangelogCacheEntry | null => {
	const cache = loadCache(app);
	const channel = getChannelKey(isBeta);
	const entry = cache[channel];
	if (!entry || entry.version !== version) {
		return null;
	}

	return entry;
};

export const getLatestCachedChangelog = (
	isBeta: boolean,
	app?: App,
): ChangelogCacheEntry | null => {
	const cache = loadCache(app);
	const channel = getChannelKey(isBeta);
	return cache[channel] ?? null;
};

export const cacheChangelog = (
	version: string,
	isBeta: boolean,
	data: Pick<ChangelogCacheEntry, "markdown" | "sourceUrl">,
	app?: App,
): void => {
	const cache = loadCache(app);
	const channel = getChannelKey(isBeta);
	cache[channel] = {
		version,
		markdown: data.markdown,
		sourceUrl: data.sourceUrl,
		updatedAt: Date.now(),
	};
	saveCache(cache, app);
};

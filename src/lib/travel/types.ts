export type LatLon = { lat: number; lon: number };

export type TravelMode = "direct" | "hike";

export type TravelRequestDirect = {
	mode: "direct";
	destination: LatLon;
	carOrigin: LatLon;
	ptOrigin: LatLon;
	departAt: string; // ISO 8601
	originLabels?: {
		car?: string;
		pt?: string;
	};
	destinationLabel?: string;
};

export type TravelRequestHike = {
	mode: "hike";
	destination: LatLon;
	hikeOrigin: LatLon;
	departAt?: string; // optional for hiking
	originLabels?: {
		hike?: string;
	};
	destinationLabel?: string;
};

export type TravelRequest = TravelRequestDirect | TravelRequestHike;

export type CarTravelResult = {
	durationMs: number;
	distanceM: number;
};

export type PublicTransportLegWalk = {
	kind: "walk";
	fromName: string | null;
	toName: string | null;
	departAt: string | null; // ISO 8601 (best effort)
	arriveAt: string | null; // ISO 8601 (best effort)
	durationMs: number | null;
	distanceM: number | null;
};

export type PublicTransportLegTransit = {
	kind: "transit";
	fromName: string | null;
	toName: string | null;
	departAt: string | null; // ISO 8601 (best effort)
	arriveAt: string | null; // ISO 8601 (best effort)
	// Vehicle / line metadata (best effort)
	line: string | null; // e.g. "40", "172", "J35"
	productName: string | null; // e.g. "Buss", "Pendeltåg"
	catCode: string | null; // ResRobot category code
	direction: string | null; // last stop / direction label
	operator: string | null;
};

export type PublicTransportLeg =
	| PublicTransportLegWalk
	| PublicTransportLegTransit;

export type PublicTransportResult = {
	durationMs: number;
	departAt: string; // ISO 8601 (best effort)
	arriveAt: string; // ISO 8601 (best effort)
	changes: number | null;
	legs: PublicTransportLeg[];
};

export type HikeProfilePoint = {
	distanceM: number;
	elevationM: number;
};

export type HikeTravelResult = {
	durationMs: number;
	distanceM: number;
	ascentM: number;
	descentM: number;
	route: LatLon[];
	profile: HikeProfilePoint[];
};

export type TravelDirectResponse = {
	mode: "direct";
	car: CarTravelResult;
	pt: PublicTransportResult;
	deepLinks: {
		carGoogleMaps?: string;
		ptSl?: string;
	};
};

export type TravelHikeResponse = {
	mode: "hike";
	hike: HikeTravelResult;
	deepLinks?: {
		hikeGoogleMaps?: string;
	};
};

export type TravelResponse = TravelDirectResponse | TravelHikeResponse;

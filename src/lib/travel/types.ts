export type LatLon = { lat: number; lon: number };

export type TravelMode = "direct" | "hike"; // hike is reserved for later

export type TravelRequest = {
	mode: TravelMode;
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

export type TravelResponse = {
	mode: TravelMode;
	car: CarTravelResult;
	pt: PublicTransportResult;
	deepLinks: {
		carGoogleMaps?: string;
		ptSl?: string;
	};
};

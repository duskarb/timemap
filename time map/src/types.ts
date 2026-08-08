export interface Station {
  id: number;
  name: string;
  line: string;
  color: string;
  x: number; // EPSG:5179 easting (m)
  y: number; // EPSG:5179 northing (m)
}

/** [fromId, toId, travelSeconds] — includes cross-line transfer links */
export type Link = [number, number, number];

export interface Vec2 {
  x: number;
  y: number;
}

export interface AttractionRaw {
  name: string;
  category: string;
  x: number;
  y: number;
}

export interface Attraction extends AttractionRaw {
  nearestStationId: number;
  walkSec: number; // walk time from nearest station (s)
}

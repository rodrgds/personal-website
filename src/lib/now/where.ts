// Where the visitor roughly is (city level, by IP via geojs), shared by the
// /now globe and map so the lookup runs once per page.
import { z } from "astro/zod";
import { CONSTANTS } from "../../data/socials";

export interface Point {
  lat: number;
  lng: number;
}

export interface Visitor extends Point {
  /** "city, country" in lower case, or "" when unknown. */
  where: string;
  /** Great-circle distance to Porto. */
  km: number;
}

export const HOME: Point = CONSTANTS.LOCATION;

const geoSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  city: z.string().optional(),
  country: z.string().optional(),
});

export function distanceKm(a: Point, b: Point): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

let pending: Promise<Visitor | null> | null = null;

export function locateVisitor(): Promise<Visitor | null> {
  pending ??= fetch("https://get.geojs.io/v1/ip/geo.json")
    .then(async (response) => {
      if (!response.ok) return null;
      const parsed = geoSchema.safeParse(await response.json());
      if (!parsed.success) return null;
      const point = { lat: parsed.data.latitude, lng: parsed.data.longitude };
      return {
        ...point,
        where: [parsed.data.city, parsed.data.country]
          .filter(Boolean)
          .join(", ")
          .toLowerCase(),
        km: Math.round(distanceKm(HOME, point)),
      };
    })
    .catch(() => null);
  return pending;
}

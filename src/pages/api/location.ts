import type { APIContext } from "astro";

export async function GET({ clientAddress }: APIContext) {
  const response = await fetch(`https://ipapi.co/${clientAddress}/json/`);
  const data = await response.json();

  return new Response(
    JSON.stringify({
      city: data.city,
      country: data.country_name,
      ip: data.ip,
      lat: data.latitude ?? "41.135891",
      lng: data.longitude ?? "-8.633180",
      region: data.region,
    }),
    {
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

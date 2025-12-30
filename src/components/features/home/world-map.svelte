<script>
  import { onMount } from "svelte";
  import Globe from "globe.gl";

  const { lat, lng } = $props();

  const myLocation = { lat: 45.12, lng: -8.61 }; // Porto, Portugal
  let globe;
  let userLocation = { lat, lng };
  let zoom = 1.5;

  function toRad(deg) {
    return deg * (Math.PI / 180);
  }

  function getDistance(loc1, loc2) {
    const R = 6371;
    const dLat = toRad(loc2.lat - loc1.lat);
    const dLon = toRad(loc2.lng - loc1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(loc1.lat)) *
        Math.cos(toRad(loc2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  onMount(() => {
    globe = Globe()(document.getElementById("globe"))
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
      .backgroundColor("rgba(0,0,0,0)")
      .labelsData([myLocation, userLocation])
      .labelLat((d) => d.lat)
      .labelLng((d) => d.lng)
      .labelText((d) => (d === myLocation ? "Me" : "You"))
      .arcStroke(1.5)
      .arcColor(() => "rgba(255, 100, 100, 0.8)")
      .width(500)
      .height(500)
      .pointOfView({ lat: 20, lng: 0, altitude: zoom });

    const distance = getDistance(myLocation, userLocation);
    // Modified zoom calculation
    zoom = Math.max(0.1, 2 - Math.log2(distance) / 2);

    globe.pointOfView(
      { lat: myLocation.lat, lng: myLocation.lng, altitude: zoom },
      2000
    );
  });
</script>

<div id="globe" class="h-[500px] w-full"></div>

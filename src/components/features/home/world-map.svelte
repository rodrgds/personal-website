<script>
  import { onMount } from "svelte";
  import { CONSTANTS } from "../../../data/socials";

  let { lat = null, lng = null } = $props();

  const myLocation = CONSTANTS.LOCATION;
  let globe;
  let userLocation = null;
  let container;
  let animationFrameId;

  function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h =
      sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function offsetIfTooClose(loc) {
    if (!loc) return loc;

    const clampLat = (lat) => Math.max(-89.5, Math.min(89.5, lat));
    const normalizeLng = (lng) => {
      // normalize to [-180, 180]
      let x = ((((lng + 180) % 360) + 360) % 360) - 180;
      // avoid -180 edge case
      if (x === -180) x = 180;
      return x;
    };

    const distanceKm = haversineKm(myLocation, loc);
    // If you're basically on top of "Me", nudge "You" so the labels don't overlap.
    // ENCOM's label rendering can still overlap even when points are fairly close,
    // so use a larger threshold and a clearly visible offset.
    if (distanceKm < 200) {
      // Push mostly east/west to separate label horizontally.
      const OFFSET_LAT_DEG = 1.5;
      const OFFSET_LNG_DEG = 3.0;

      const nextLat = clampLat(loc.lat + OFFSET_LAT_DEG);
      const nextLng = normalizeLng(loc.lng + OFFSET_LNG_DEG);

      return { lat: nextLat, lng: nextLng };
    }

    return loc;
  }

  onMount(async () => {
    // Fetch user's location
    if (lat && lng) {
      userLocation = { lat, lng };
    } else {
      try {
        const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
        const data = await res.json();
        userLocation = {
          lat: parseFloat(data.latitude),
          lng: parseFloat(data.longitude),
        };
      } catch (e) {
        console.error("Failed to fetch location:", e);
      }
    }

    // Load dependencies in order
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    try {
      // Load data and grid files first
      await loadScript("/encom-data.js");
      await loadScript("/encom-grid.js");
      // Then load the main globe library
      await loadScript("/encom-globe.min.js");

      if (window.ENCOM && window.ENCOM.Globe && window.grid) {
        const width = container.clientWidth;
        const height = 500;

        // Get colors from CSS variables
        const bgColor = getComputedStyle(document.documentElement)
          .getPropertyValue("--background-color")
          .trim();
        const accentColor = getComputedStyle(document.documentElement)
          .getPropertyValue("--link-color")
          .trim();

        globe = new window.ENCOM.Globe(width, height, {
          font: "JetBrains Mono",
          data: window.data || [],
          tiles: window.grid.tiles,
          baseColor: accentColor,
          markerColor: accentColor,
          pinColor: "#ffffff",
          satelliteColor: "#ffffff",
          scale: 1,
          dayLength: 14000,
          introLinesDuration: 2000,
          maxPins: 500,
          maxMarkers: 4,
          viewAngle: 0.4,
        });

        // Override background color using Three.js renderer
        if (globe.renderer) {
          // Convert hex color to integer for Three.js
          const colorInt = parseInt(bgColor.replace("#", ""), 16);
          globe.renderer.setClearColor(colorInt, 1);
        }

        container.appendChild(globe.domElement);

        // Animation loop
        function animate() {
          if (globe) {
            globe.tick();
          }
          animationFrameId = requestAnimationFrame(animate);
        }

        // Initialize globe
        globe.init();
        animate();

        // Add constellation
        const constellation = [];
        const opts = {
          coreColor: accentColor,
          numWaves: 8,
        };
        const alt = 1;

        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 3; j++) {
            constellation.push({
              lat: 50 * i - 30 + 15 * Math.random(),
              lon: 120 * j - 120 + 30 * i,
              altitude: alt,
            });
          }
        }
        globe.addConstellation(constellation, opts);

        // Add my location marker
        setTimeout(() => {
          globe.addMarker(myLocation.lat, myLocation.lng, "Me");

          // Add visitor location marker if available
          if (userLocation) {
            const adjustedUserLocation = offsetIfTooClose(userLocation);
            globe.addMarker(
              adjustedUserLocation.lat,
              adjustedUserLocation.lng,
              "You",
              Math.abs(myLocation.lng - adjustedUserLocation.lng) > 25,
            );
          }
        }, 1000);
      }
    } catch (e) {
      console.error("Failed to load encom-globe:", e);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (globe && globe.destroy) {
        globe.destroy();
      }
    };
  });
</script>

<div bind:this={container} class="globe-container"></div>

<style>
  .globe-container {
    width: 100%;
    height: 500px;
    position: relative;
  }
</style>

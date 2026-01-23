<script>
  import { onMount } from "svelte";
  import { CONSTANTS } from "../../../data/socials";

  let { lat = null, lng = null } = $props();

  const myLocation = CONSTANTS.LOCATION;
  let globe;
  let userLocation = null;
  let container;
  let animationFrameId;

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
          font: "Inconsolata",
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
            globe.addMarker(
              userLocation.lat,
              userLocation.lng,
              "You",
              Math.abs(myLocation.lng - userLocation.lng) > 25,
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

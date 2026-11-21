// The Porto map drawing, used by the Porto peek.
import { EUROPE_RINGS, PORTUGAL_RINGS, SPAIN_RINGS } from "./geo";
import { smoothstep, type InkScene } from "./ink";

const ACCENT = "#ff0000";
const PORTO = { lon: -8.611, lat: 41.149 };

interface Camera {
  lon: number;
  lat: number;
  span: number;
}

const CAMERA_STOPS: Camera[] = [
  { lon: 6, lat: 49, span: 52 },
  { lon: -4.6, lat: 40.2, span: 15 },
  { lon: -8.1, lat: 39.9, span: 6.4 },
  { lon: PORTO.lon + 0.2, lat: PORTO.lat - 0.05, span: 1.7 },
];

function mercatorY(lat: number): number {
  const phi = (Math.max(-80, Math.min(80, lat)) * Math.PI) / 180;
  return (Math.log(Math.tan(Math.PI / 4 + phi / 2)) * 180) / Math.PI;
}

function cameraAt(progress: number): Camera {
  const t = smoothstep(0.08, 0.9, progress) * (CAMERA_STOPS.length - 1);
  const i = Math.min(CAMERA_STOPS.length - 2, Math.floor(t));
  const local = smoothstep(0, 1, t - i);
  const a = CAMERA_STOPS[i];
  const b = CAMERA_STOPS[i + 1];
  return {
    lon: a.lon + (b.lon - a.lon) * local,
    lat: a.lat + (b.lat - a.lat) * local,
    span: Math.exp(
      Math.log(a.span) + (Math.log(b.span) - Math.log(a.span)) * local,
    ),
  };
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  ring: number[],
  project: (lon: number, lat: number) => [number, number],
): void {
  for (let i = 0; i < ring.length; i += 2) {
    const [x, y] = project(ring[i], ring[i + 1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function gray(level: number): string {
  const v = Math.round(Math.max(0, Math.min(1, level)) * 255);
  return `rgb(${v},${v},${v})`;
}

export function mapScene(): InkScene {
  return {
    draw(ctx, width, height, progress, time) {
      const cam = cameraAt(progress);
      const scale = Math.max(width, height) / cam.span;
      const cy = mercatorY(cam.lat);
      const project = (lon: number, lat: number): [number, number] => [
        width / 2 + (lon - cam.lon) * scale,
        height / 2 - (mercatorY(lat) - cy) * scale,
      ];

      // Graticule, finer as the camera closes in.
      const step = cam.span > 20 ? 10 : cam.span > 5 ? 2 : 0.5;
      ctx.strokeStyle = gray(0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const lonStart = Math.floor((cam.lon - cam.span) / step) * step;
      for (let lon = lonStart; lon <= cam.lon + cam.span; lon += step) {
        const [x] = project(lon, 0);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      const latStart = Math.floor((cam.lat - cam.span) / step) * step;
      for (let lat = latStart; lat <= cam.lat + cam.span; lat += step) {
        const [, y] = project(0, lat);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      const focus = smoothstep(0.25, 0.75, progress);
      ctx.lineWidth = 1;
      ctx.fillStyle = gray(0.8);
      ctx.strokeStyle = gray(0.5);
      ctx.beginPath();
      for (const ring of EUROPE_RINGS) tracePath(ctx, ring, project);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      for (const ring of SPAIN_RINGS) tracePath(ctx, ring, project);
      ctx.fillStyle = gray(0.8 - focus * 0.06);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      for (const ring of PORTUGAL_RINGS) tracePath(ctx, ring, project);
      ctx.fillStyle = gray(0.74 - focus * 0.34);
      ctx.fill();
      ctx.strokeStyle = gray(0.1);
      ctx.stroke();

      // Porto: a pulsing accent dot that grows as the camera arrives.
      const [px, py] = project(PORTO.lon, PORTO.lat);
      const arrive = smoothstep(0.45, 0.95, progress);
      const radius = 1.5 + arrive * 2.5;
      const pulse = (time / 1600) % 1;
      ctx.strokeStyle = ACCENT;
      ctx.fillStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, radius + pulse * (8 + arrive * 14), 0, Math.PI * 2);
      ctx.globalAlpha = 1 - pulse;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

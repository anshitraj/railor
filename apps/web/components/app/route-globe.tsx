"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, LocateFixed, Pause, Play } from "lucide-react";
import { COUNTRY_CENTROIDS, unproject, type LatLng } from "@railor/core/geo";
import type { GlobalRoute } from "@railor/core/route-map";
import { WORLD_DOTS_PATH } from "../marketing/world-dots";
import styles from "./global-route-map.module.css";

type Vector = [x: number, y: number, z: number];
type Point = { x: number; y: number; z: number };
type Camera = { yaw: number; pitch: number };
type Project = (position: Vector) => Point;
type Hit = { key: string; country?: string; segments: Array<Point | null> };

const radians = Math.PI / 180;
const initialCamera: Camera = { yaw: -15 * radians, pitch: 20 * radians };
const palette = { grid: "#53707a", land: "#9ab2b5", priced: "#ec936b", mapped: "#60a8af", active: "#ffc6a0" };
export const routeKey = (route: GlobalRoute) => `${route.entityCountry}→${route.destinationCountry}`;

function vector({ lat, lng }: LatLng): Vector {
  const parallel = Math.cos(lat * radians);
  return [parallel * Math.sin(lng * radians), Math.sin(lat * radians), parallel * Math.cos(lng * radians)];
}

const land = Array.from(WORLD_DOTS_PATH.matchAll(/M([\d.]+) ([\d.]+)h0/g), ([, x, y]) => vector(unproject({ x: Number(x), y: Number(y) })));
const positions = Object.fromEntries(Object.entries(COUNTRY_CENTROIDS).map(([code, location]) => [code, vector(location)]));
const grid = [
  ...[-60, -30, 0, 30, 60].map(lat => Array.from({ length: 73 }, (_, i) => vector({ lat, lng: i * 5 - 180 }))),
  ...Array.from({ length: 12 }, (_, i) => Array.from({ length: 37 }, (_, j) => vector({ lng: i * 30, lat: j * 5 - 90 }))),
];

/** Sample a lifted great-circle path in origin-to-destination order. */
export function globeArc(from: Vector, to: Vector, segments: number): Vector[] {
  const angle = Math.acos(Math.max(-1, Math.min(1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2])));
  const sine = Math.sin(angle);
  return Array.from({ length: segments + 1 }, (_, index) => {
    const progress = index / segments;
    const lift = 1 + Math.min(0.19, angle * 0.09) * Math.sin(Math.PI * progress);
    const a = Math.abs(sine) < 1e-6 ? 1 - progress : Math.sin((1 - progress) * angle) / sine;
    const b = Math.abs(sine) < 1e-6 ? progress : Math.sin(progress * angle) / sine;
    return [lift * (a * from[0] + b * to[0]), lift * (a * from[1] + b * to[1]), lift * (a * from[2] + b * to[2])];
  });
}

function projection({ yaw, pitch }: Camera, width: number, height: number): { project: Project; radius: number; cx: number; cy: number } {
  const sy = Math.sin(yaw), cyaw = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const radius = Math.min(width, height) * 0.42;
  const cx = width / 2, cy = height / 2;
  const project: Project = ([x, y, z]) => {
    const forward = z * cyaw + x * sy;
    return {
      x: cx + radius * (x * cyaw - z * sy),
      y: cy - radius * (y * cp - forward * sp),
      z: y * sp + forward * cp,
    };
  };
  return { project, radius, cx, cy };
}

function targetCamera(from: Vector, to: Vector = from): Camera {
  const middle: Vector = [from[0] + to[0], from[1] + to[1], from[2] + to[2]];
  // View the route from slightly outside its plane so the arc has visible curvature.
  const normal: Vector = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
  ];
  const scale = .25 * Math.hypot(...middle) / (Math.hypot(...normal) || 1);
  const [x, y, z] = middle.map((value, index) => value + scale * normal[index]!) as Vector;
  return { yaw: Math.atan2(x, z), pitch: Math.atan2(y, Math.hypot(x, z)) };
}

function trace(context: CanvasRenderingContext2D, points: Array<Point | null>) {
  let continuing = false;
  for (const point of points) {
    if (!point) { continuing = false; continue; }
    if (continuing) context.lineTo(point.x, point.y);
    else context.moveTo(point.x, point.y);
    continuing = true;
  }
}

function pointNear(x: number, y: number, points: Array<Point | null>, radius: number) {
  let previous: Point | null = null;
  for (const point of points) {
    if (point) {
      const from = previous ?? point;
      const dx = point.x - from.x, dy = point.y - from.y;
      const length = dx * dx + dy * dy;
      const t = length ? Math.min(1, Math.max(0, ((x - from.x) * dx + (y - from.y) * dy) / length)) : 0;
      if (Math.hypot(x - from.x - t * dx, y - from.y - t * dy) <= radius) return true;
    }
    previous = point;
  }
  return false;
}

export function RouteGlobe({ routes, selected, focus, onRoute, onCountry }: {
  routes: GlobalRoute[];
  selected: GlobalRoute | null;
  focus: string | null;
  onRoute: (key: string) => void;
  onCountry: (code: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<Camera>({ ...initialCamera });
  const target = useRef<Camera | null>(null);
  const invalidate = useRef<() => void>(() => {});
  const hits = useRef<Hit[]>([]);
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const originCode = selected?.entityCountry;
  const destinationCode = selected?.destinationCountry;
  const activeKey = selected ? routeKey(selected) : null;

  const markers = useMemo(() => {
    const count = new Map<string, number>();
    for (const route of routes) for (const code of new Set([route.entityCountry, route.destinationCountry])) {
      if (positions[code]) count.set(code, (count.get(code) ?? 0) + 1);
    }
    return [...count].sort((a, b) => b[1] - a[1]).map(([code]) => code);
  }, [routes]);
  const paths = useMemo(() => routes.flatMap(route => {
    const from = positions[route.entityCountry], to = positions[route.destinationCountry];
    if (!from || !to || from === to) return [];
    return [{ key: routeKey(route), priced: Boolean(route.cheapest), vertices: globeArc(from, to, routes.length > 100 ? 16 : 36) }];
  }), [routes]);
  const playback = playing && !reduced;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const a = originCode ? positions[originCode] : focus ? positions[focus] : null;
    const b = destinationCode ? positions[destinationCode] : undefined;
    if (a) target.current = targetCamera(a, b);
    invalidate.current();
  }, [originCode, destinationCode, focus]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) { setUnavailable(true); return; }
    let width = 1, height = 1;
    let dpr = 1;
    let frame = 0;
    let last = 0;
    let visible = false;
    let dirty = true;
    let elapsed = 0;
    const endpoints = new Set([originCode, destinationCode]);
    const packed = paths.length > 100;
    const ordered = [...markers].sort((a, b) => Number(endpoints.has(b) || b === focus) - Number(endpoints.has(a) || a === focus));

    function redraw(time: number) {
      if (!context) return;
      const { project, cx, cy, radius } = projection(camera.current, width, height);
      const ctx = context;
      ctx.clearRect(0, 0, width, height);
      const ocean = ctx.createRadialGradient(cx - radius * .32, cy - radius * .4, radius * .04, cx, cy, radius * 1.06);
      ocean.addColorStop(0, "#27434a");
      ocean.addColorStop(.65, "#17272d");
      ocean.addColorStop(1, "#0b161a");
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = ocean; ctx.fill();
      ctx.strokeStyle = "#55717a"; ctx.lineWidth = 1; ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      for (const line of grid) trace(ctx, line.map(point => { const p = project(point); return p.z > 0 ? p : null; }));
      ctx.strokeStyle = palette.grid; ctx.globalAlpha = .39; ctx.lineWidth = .55; ctx.stroke();
      ctx.beginPath();
      const dot = Math.max(.8, Math.min(1.8, radius / 150));
      for (const point of land) {
        const p = project(point);
        if (p.z > .025) ctx.rect(p.x - dot / 2, p.y - dot / 2, dot, dot);
      }
      ctx.fillStyle = palette.land; ctx.globalAlpha = .65; ctx.fill();
      ctx.restore();

      const projected = paths.map(path => ({
        ...path, segments: path.vertices.map(vertex => { const p = project(vertex); return p.z >= 0 ? p : null; }),
      }));
      const active = projected.find(path => path.key === activeKey);
      const hitRoutes: Hit[] = [];
      for (const priced of [false, true]) {
        ctx.beginPath();
        for (const path of projected) {
          if (path === active || priced !== path.priced) continue;
          trace(ctx, path.segments);
          hitRoutes.push(path);
        }
        ctx.strokeStyle = priced ? palette.priced : palette.mapped;
        ctx.lineWidth = packed ? .75 : 1.25;
        ctx.globalAlpha = activeKey ? .15 : packed ? .32 : .72;
        ctx.stroke();
      }
      if (active) {
        ctx.beginPath(); trace(ctx, active.segments);
        ctx.strokeStyle = palette.active; ctx.lineWidth = 2.8; ctx.globalAlpha = 1; ctx.stroke();
        const end = active.segments.at(-1);
        const prior = active.segments.at(-2);
        if (end && prior) {
          const angle = Math.atan2(end.y - prior.y, end.x - prior.x);
          const x = end.x - Math.cos(angle) * 7, y = end.y - Math.sin(angle) * 7;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x - Math.cos(angle - .55) * 8, y - Math.sin(angle - .55) * 8);
          ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(angle + .55) * 8, y - Math.sin(angle + .55) * 8); ctx.stroke();
        }
        const travel = (time % 2950) / 2950 * (active.segments.length - 1);
        const step = Math.floor(travel);
        const a = active.segments[step], b = active.segments[step + 1];
        if (playback && a && b) {
          const fraction = travel - step;
          ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction, 3.8, 0, Math.PI * 2);
          ctx.fillStyle = "#fff3e0"; ctx.fill();
        }
      }

      const hitMarkers: Hit[] = [];
      const labelPoints: Point[] = [];
      for (const code of ordered) {
        const vertex = positions[code];
        if (!vertex) continue;
        const p = project(vertex);
        if (p.z < .025) continue;
        const primary = endpoints.has(code) || code === focus;
        const label = primary || (labelPoints.length < (width < 460 ? 3 : 6) && labelPoints.every(other => Math.hypot(other.x - p.x, other.y - p.y) > 38));
        ctx.globalAlpha = primary || !activeKey ? 1 : .47;
        if (primary) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.strokeStyle = palette.priced; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, primary ? 4.5 : 2.7, 0, Math.PI * 2);
        ctx.fillStyle = primary ? palette.active : "#b9e6de"; ctx.fill();
        if (label) {
          labelPoints.push(p);
          ctx.font = "600 10px monospace"; ctx.lineWidth = 3;
          ctx.strokeStyle = "#121b1f"; ctx.strokeText(code, p.x + 8, p.y - 6);
          ctx.fillStyle = "#f8f1df"; ctx.fillText(code, p.x + 8, p.y - 6);
        }
        hitMarkers.push({ key: code, country: code, segments: [p] });
      }
      ctx.globalAlpha = 1;
      hits.current = [...hitMarkers, ...(active ? [active] : []), ...hitRoutes];
    }

    function tick(time: number) {
      frame = 0;
      if (packed && !dirty && last && time - last < 30) { schedule(); return; }
      const delta = last ? Math.min(45, time - last) : 16;
      last = time;
      const destination = target.current;
      if (destination) {
        const turn = Math.atan2(Math.sin(destination.yaw - camera.current.yaw), Math.cos(destination.yaw - camera.current.yaw));
        const tilt = destination.pitch - camera.current.pitch;
        const multiplier = playback ? 1 - Math.exp(-delta / 140) : 1;
        camera.current.yaw += turn * multiplier;
        camera.current.pitch += tilt * multiplier;
        if (!playback || Math.abs(turn) + Math.abs(tilt) < .002) target.current = null;
      } else if (playback && !activeKey && !focus && !gesture.current && visible) {
        camera.current.yaw += delta * .00015;
      }
      if (visible && playback) elapsed += delta;
      redraw(elapsed);
      dirty = false;
      if (visible && (target.current || playback && (!focus || Boolean(activeKey)))) schedule();
    }

    function schedule() {
      if (!frame && (visible || dirty)) frame = requestAnimationFrame(tick);
    }
    invalidate.current = () => { dirty = true; schedule(); };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = entry.contentRect.width; height = entry.contentRect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.8);
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true; schedule();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) { last = 0; schedule(); }
      else if (frame) { cancelAnimationFrame(frame); frame = 0; }
    });
    resize.observe(element); intersection.observe(element);
    return () => {
      resize.disconnect(); intersection.disconnect(); cancelAnimationFrame(frame);
      invalidate.current = () => {};
    };
  }, [paths, markers, originCode, destinationCode, activeKey, focus, playback]);

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const drag = gesture.current;
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; drag.x = event.clientX; drag.y = event.clientY;
    target.current = null;
    camera.current.yaw -= dx * .009;
    camera.current.pitch = Math.max(-1.3, Math.min(1.3, camera.current.pitch + dy * .009));
    invalidate.current();
  }

  function release(event: PointerEvent<HTMLCanvasElement>) {
    const drag = gesture.current;
    gesture.current = null;
    if (!drag || drag.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = hits.current.find(item => pointNear(event.clientX - rect.left, event.clientY - rect.top, item.segments, item.country ? 13 : 7));
    if (hit?.country) onCountry(hit.country);
    else if (hit) onRoute(hit.key);
  }

  function turn(direction: number) {
    target.current = { yaw: camera.current.yaw + direction * .52, pitch: camera.current.pitch };
    invalidate.current();
  }

  return (
    <div className={styles.globe}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        aria-label="Globe of documented payment routes. Use the route list to select any corridor."
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = { x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={() => { gesture.current = null; }}
        onLostPointerCapture={() => { gesture.current = null; }}
      />
      {unavailable ? <p className={styles.globeFallback}>Explore the routes in the list.</p> : null}
      {!unavailable ? <div className={styles.globeControls} aria-label="Globe controls">
        <button type="button" aria-label="Rotate globe left" title="Rotate left" onClick={() => turn(-1)}><ChevronLeft size={17} /></button>
        <button type="button" aria-label="Rotate globe right" title="Rotate right" onClick={() => turn(1)}><ChevronRight size={17} /></button>
        <button type="button" aria-label="Recenter globe" title="Recenter globe" onClick={() => { target.current = initialCamera; invalidate.current(); }}><LocateFixed size={16} /></button>
        {!reduced ? <button type="button" aria-label={playing ? "Pause globe animation" : "Play globe animation"} title={playing ? "Pause animation" : "Play animation"} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button> : null}
      </div> : null}
    </div>
  );
}

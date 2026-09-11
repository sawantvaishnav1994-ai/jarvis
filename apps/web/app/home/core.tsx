"use client";
import { useEffect, useRef, useState } from "react";
export function NeuralCore({
    state,
    reducedMotion,
}: {
    state: "idle" | "authorizing" | "waiting" | "error" | "responding";
    reducedMotion: boolean;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [unavailable, setUnavailable] = useState(false);
    useEffect(() => {
        const element = canvas.current;
        if (!element) return;
        const context = element.getContext("2d", { alpha: true });
        if (!context) {
            setUnavailable(true);
            return;
        }
        let frame = 0,
            last = 0;
        const points = Array.from({ length: 720 }, (_, i) => ({
            phase: Math.floor(i / 60) * 2.399963,
            u: ((i % 60) / 59) * Math.PI * 2,
        }));
        const draw = (now: number) => {
            if (document.hidden) return;
            frame = requestAnimationFrame(draw);
            if (now - last < (reducedMotion ? 250 : state === "idle" ? 80 : 40))
                return;
            last = now;
            const rect = element.getBoundingClientRect(),
                dpr = Math.min(window.devicePixelRatio, 1.5);
            if (
                element.width !== Math.round(rect.width * dpr) ||
                element.height !== Math.round(rect.height * dpr)
            ) {
                element.width = Math.round(rect.width * dpr);
                element.height = Math.round(rect.height * dpr);
            }
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            context.clearRect(0, 0, rect.width, rect.height);
            const t = reducedMotion ? 0 : now / 1000;
            const rotation = Math.sin(t * 0.14) * 0.3;
            const scale = Math.min(rect.width, rect.height) * 0.4;
            const color =
                state === "error"
                    ? "225,145,131"
                    : state === "waiting"
                      ? "163,160,222"
                      : "140,199,216";
            let previous: { x: number; y: number } | null = null;
            points.forEach(({ phase, u }, i) => {
                const radius =
                    0.58 +
                    0.15 * Math.sin(u * 3 + phase) +
                    0.06 * Math.cos(u * 2 + phase * 0.3);
                const breath =
                    1 +
                    Math.sin(t * (state === "responding" ? 1.1 : 0.6)) *
                        (state === "responding" ? 0.035 : 0.014);
                const x =
                    (Math.cos(u + phase * 0.13) * radius +
                        0.17 * Math.sin(phase)) *
                    breath;
                const y =
                    Math.sin(u) * (0.67 + 0.13 * Math.cos(phase)) +
                    0.1 * Math.sin(u * 2 + phase);
                const z =
                    Math.sin(u * 2 + phase) * 0.37 + Math.cos(u + phase) * 0.17;
                const depth = z * Math.cos(rotation) - x * Math.sin(rotation);
                const perspective = 3 / (3 - depth);
                const projected = {
                    x:
                        rect.width / 2 +
                        (x * Math.cos(rotation) + z * Math.sin(rotation)) *
                            perspective *
                            scale,
                    y: rect.height / 2 + y * perspective * scale,
                };
                if (previous && i % 60 !== 0) {
                    context.beginPath();
                    context.moveTo(previous.x, previous.y);
                    context.lineTo(projected.x, projected.y);
                    context.strokeStyle = `rgba(${color},${0.13 + (depth + 0.6) * 0.12})`;
                    context.lineWidth = 0.7;
                    context.stroke();
                }
                context.beginPath();
                context.arc(
                    projected.x,
                    projected.y,
                    0.7 + (depth + 0.6) * 0.6,
                    0,
                    Math.PI * 2,
                );
                context.fillStyle = `rgba(${color},${0.4 + (depth + 0.6) * 0.3})`;
                context.fill();
                previous = projected;
            });
            element.dataset.frames = String(
                Number(element.dataset.frames || 0) + 1,
            );
        };
        const visibility = () => {
            cancelAnimationFrame(frame);
            last = 0;
            if (!document.hidden) frame = requestAnimationFrame(draw);
        };
        document.addEventListener("visibilitychange", visibility);
        frame = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener("visibilitychange", visibility);
        };
    }, [state, reducedMotion]);
    return (
        <div className="home-core" data-state={state}>
            <canvas ref={canvas} aria-hidden="true" />
            {unavailable && (
                <p>Visual unavailable. Conversation is still accessible.</p>
            )}
        </div>
    );
}

import * as THREE from "../../../node_modules/three/build/three.module.js";
import { MicrophonePreview } from "./microphone.mjs";
const $ = (id) => document.getElementById(id);
const bridge = window.jarvisPresence;
const canvas = document.querySelector("canvas");
let state = "idle",
    amplitude = 0,
    runtime = { state: "idle", amplitude: 0, connected: false };
let expanded = false;
let reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let renderer,
    frame = 0,
    last = 0,
    quality = 1,
    smoothed = 0,
    renderTimes = [],
    intervals = [];
let noticeTimer, collapseTimer, clickTimer;
const started = performance.now();
function notice(text, duration = 5000) {
    $("notice").textContent = text;
    $("notice").hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => ($("notice").hidden = true), duration);
}
function command(name, value) {
    return bridge
        .command(name, value)
        .catch(() => notice("Desktop control unavailable."));
}
function expand(value) {
    command("expand", value);
}
function activity() {
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
        if (!document.activeElement?.closest("#panel")) expand(false);
    }, 8000);
}
function setState() {
    state = microphone.stream ? "listening" : runtime.state;
    amplitude = microphone.stream ? amplitude : runtime.amplitude;
    const title = microphone.stream
        ? "Microphone active · local preview"
        : runtime.connected
          ? {
                idle: "Idle",
                listening: "Listening",
                reasoning: "Thinking",
                responding: "Speaking",
            }[state]
          : "Idle · runtime disconnected";
    $("state").textContent = title;
    $("label").textContent = title;
    $("core").setAttribute("aria-label", `JARVIS ${title}. Open controls`);
    $("mic").hidden = state !== "listening";
}
const microphone = new MicrophonePreview({
    permission: (enabled) => bridge.command("microphone", enabled),
    capture: () =>
        navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false,
        }),
    createContext: () => new AudioContext(),
    isVisible: () => !document.hidden,
    onChange: () => {
        $("listen").textContent = microphone.stream ? "Mute" : "Mic preview";
        amplitude = 0;
        setState();
    },
    onError: () => notice("Microphone unavailable. Check OS permission."),
});
const stopMic = () => microphone.stop();
$("listen").onclick = () => microphone.toggle();
$("home").onclick = () => command("home");
$("hide").onclick = () => {
    void stopMic();
    command("hide");
};
$("collapse").onclick = () => expand(false);
$("motion").checked = reduced;
$("motion").onchange = (e) => {
    reduced = e.target.checked;
};
$("contrast").onchange = (e) =>
    document.body.classList.toggle("contrast", e.target.checked);
$("labels").onchange = (e) => ($("label").hidden = !e.target.checked);
$("size").onchange = (e) => command("size", Number(e.target.value));
$("panel").onpointermove = activity;
let down = null,
    moved = false;
$("core").onpointerdown = (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY };
    moved = false;
    $("core").setPointerCapture(e.pointerId);
    command("drag-start");
};
$("core").onpointermove = (e) => {
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) moved = true;
    if (moved) command("drag-move");
};
$("core").onpointerup = () => {
    if (!down) return;
    down = null;
    command("drag-end");
    if (!moved) {
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => expand(!expanded), 250);
    }
};
$("core").onpointercancel = () => {
    down = null;
    command("drag-end");
};
$("core").ondblclick = () => {
    clearTimeout(clickTimer);
    command("home");
};
$("core").onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        expand(!expanded);
    }
};
document.onkeydown = (e) => {
    if (e.key === "Escape") {
        stopMic();
        expanded ? expand(false) : command("hide");
    }
};
bridge.subscribe((type, value) => {
    if (type === "runtime-state") {
        runtime = value;
        setState();
    }
    if (type === "expanded") {
        expanded = value;
        document.body.classList.toggle("expanded", value);
        $("panel").hidden = !value;
        activity();
        resize();
    }
    if (type === "expand-request") expand(true);
    if (type === "collapse-request")
        setTimeout(() => {
            if (!document.hasFocus()) expand(false);
        }, 300);
    if (type === "suspend") stopMic();
    if (type === "notice") notice(value);
});
let scene, camera, points, lines, positions, material, lineMaterial;
const count = 720;
const seeds = Array.from({ length: count }, (_, i) => {
    const strand = Math.floor(i / 60),
        t = (i % 60) / 59;
    return { strand, t, phase: strand * 2.399963 };
});
function resize() {
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
}
try {
    renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
    });
    renderer.setClearColor(0, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    camera.position.z = 4.7;
    positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    material = new THREE.PointsMaterial({
        color: 0xa9d9f4,
        size: 0.018,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    points = new THREE.Points(geometry, material);
    scene.add(points);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array((count - 12) * 6), 3),
    );
    lineMaterial = new THREE.LineBasicMaterial({
        color: 0x6389b2,
        transparent: true,
        opacity: 0.31,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    lines = new THREE.LineSegments(edgeGeometry, lineMaterial);
    scene.add(lines);
    resize();
} catch {
    notice(
        "3D acceleration unavailable. State and controls remain available.",
        60000,
    );
    $("labels").checked = true;
    $("label").hidden = false;
}
window.addEventListener("resize", resize);
canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(frame);
    stopMic();
    notice("Graphics interrupted. Reopen presence to recover.", 60000);
});
function draw(now) {
    if (document.hidden) return;
    frame = requestAnimationFrame(draw);
    const fps = reduced ? 4 : state === "idle" ? 12 : quality < 0.7 ? 24 : 30;
    if (now - last < 1000 / fps) return;
    if (last) intervals.push(now - last);
    last = now;
    if (intervals.length > 240) intervals.shift();
    const { analyser, audioData } = microphone;
    if (analyser) {
        analyser.getByteTimeDomainData(audioData);
        amplitude = Math.min(
            1,
            Math.sqrt(
                audioData.reduce((s, n) => s + ((n - 128) / 128) ** 2, 0) /
                    audioData.length,
            ) * 5,
        );
    }
    smoothed += (amplitude - smoothed) * 0.18;
    if (!renderer) return;
    const begin = performance.now(),
        t = reduced ? 0 : now / 1000;
    const thinking = state === "reasoning",
        speaking = state === "responding",
        listening = state === "listening";
    const energy = listening || speaking ? smoothed : 0;
    const breathing = 1 + Math.sin(t * 0.6) * 0.013 + energy * 0.12;
    seeds.forEach(({ strand, t: u, phase }, i) => {
        const a = u * Math.PI * 2,
            warp = thinking
                ? Math.sin(t * 0.45 + phase) * 0.16
                : 0.03 * Math.sin(t * 0.23 + phase);
        const radius =
            0.58 +
            0.15 * Math.sin(a * 3 + phase) +
            0.06 * Math.cos(a * 2 + phase * 0.3);
        positions[i * 3] =
            (Math.cos(a + phase * 0.13) * radius + 0.17 * Math.sin(phase)) *
            breathing;
        positions[i * 3 + 1] =
            (Math.sin(a) * (0.67 + 0.13 * Math.cos(phase)) +
                0.1 * Math.sin(a * 2 + phase + warp)) *
            breathing;
        positions[i * 3 + 2] =
            Math.sin(a * 2 + phase) * 0.37 + Math.cos(a + phase) * 0.17 + warp;
        if (speaking) {
            positions[i * 3] *= 1 + 0.05 * Math.sin(a - t * 2) * energy;
        }
    });
    points.geometry.attributes.position.needsUpdate = true;
    const edge = lines.geometry.attributes.position.array;
    let k = 0;
    for (let i = 0; i < count; i++) {
        if (i % 60 === 59) continue;
        for (let j = 0; j < 3; j++) edge[k++] = positions[i * 3 + j];
        for (let j = 0; j < 3; j++) edge[k++] = positions[(i + 1) * 3 + j];
    }
    lines.geometry.attributes.position.needsUpdate = true;
    const n = Math.floor((count - 12) * quality) * 2;
    lines.geometry.setDrawRange(0, n);
    points.geometry.setDrawRange(0, Math.floor(count * quality));
    const color = thinking
        ? 0xb0a4d0
        : listening
          ? 0x83d8ed
          : speaking
            ? 0xbdc4f4
            : 0x90adc7;
    material.color.lerp(new THREE.Color(color), 0.12);
    lineMaterial.color.copy(material.color);
    points.rotation.y = lines.rotation.y = reduced
        ? 0
        : Math.sin(t * 0.14) * 0.23;
    points.rotation.x = lines.rotation.x = reduced
        ? 0
        : Math.cos(t * 0.11) * 0.13;
    renderer.render(scene, camera);
    canvas.dataset.frames = String(Number(canvas.dataset.frames || 0) + 1);
    const cost = performance.now() - begin;
    renderTimes.push(cost);
    if (renderTimes.length > 240) renderTimes.shift();
    if (cost > 12) quality = Math.max(0.4, quality - 0.04);
    else if (cost < 4) quality = Math.min(1, quality + 0.002);
}
document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame);
    last = 0;
    if (document.hidden) stopMic();
    else frame = requestAnimationFrame(draw);
});
$("metrics").onclick = async () => {
    const native = await command("metrics");
    const mean = (a) =>
        a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
    const report = {
        measuredAt: new Date().toISOString(),
        state,
        windowMs: performance.now() - started,
        frames: intervals.length,
        fps: 1000 / mean(intervals),
        meanRenderSubmissionMs: mean(renderTimes),
        quality,
        particles: Math.floor(count * quality),
        ...native,
    };
    console.info("JARVIS presence performance", JSON.stringify(report));
    notice(
        `${report.fps.toFixed(1)} fps · ${report.meanRenderSubmissionMs.toFixed(2)} ms render submission · ${report.particles} particles. Full metrics in developer console. GPU utilization and battery require OS measurement.`,
        10000,
    );
};
setState();
frame = requestAnimationFrame(draw);

$("passthrough").onclick = () => {
    expand(false);
    command("click-through", true);
};

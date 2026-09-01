// Lumina UI — Voice Visualizer Engine
// High-performance canvas visualizer decoupling theme graphics from speech recognition and inference.

class VoiceVisualizer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.analyser = null;
        this.dataArray = null;
        this.state = "idle";
        this.isMuted = false;
        this.animationId = null;

        this.currentVolume = 0;
        this.targetVolume = 0;
        this.phase = 0;
        this.spectrumPeaks = new Array(24).fill(0);
        this.visualizerParticles = [];
        this.rainbowParticles = [];
    }

    init(canvas, analyser, dataArray) {
        this.canvas = canvas;
        if (this.canvas) {
            this.ctx = this.canvas.getContext("2d");
        }
        this.analyser = analyser;
        this.dataArray = dataArray;
    }

    setState(state, isMuted = false) {
        this.state = state;
        this.isMuted = isMuted;

        const glow = document.getElementById("live-voice-glow");
        const cfg = this.getThemeConfig();
        if (glow) {
            glow.style.backgroundColor = cfg.glowColor;
            if (state === "listening") glow.style.transform = "scale(1)";
            else if (state === "thinking") glow.style.transform = "scale(1.15)";
            else if (state === "speaking") glow.style.transform = "scale(1.25)";
            else if (state === "muted") glow.style.transform = "scale(0.85)";
        }
    }

    start() {
        if (!this.canvas || !this.ctx) return;
        this.stop();

        const render = () => {
            if (!this.canvas) return;
            this.drawSpeechOrb();
            this.animationId = requestAnimationFrame(render);
        };
        render();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    getThemeConfig() {
        const theme = document.body.getAttribute("data-theme") || "default";
        const configs = {
            default: {
                visualizerType: "radialAura",
                glowColor: "#6366f1",
                colors: {
                    listening: ["#818cf8", "#6366f1", "#38bdf8"],
                    speaking: ["#c084fc", "#a855f7", "#6366f1"],
                    thinking: ["#fb7185", "#a855f7", "#f43f5e"],
                    muted: ["#94a3b8", "#475569", "#334155"]
                },
                glow: {
                    listening: "rgba(99, 102, 241, 0.45)",
                    speaking: "rgba(168, 85, 247, 0.5)",
                    thinking: "rgba(244, 63, 94, 0.45)",
                    muted: "rgba(100, 116, 139, 0.3)"
                }
            },
            amoled: {
                visualizerType: "radialAura",
                glowColor: "#818cf8",
                colors: {
                    listening: ["#ffffff", "#e4e4e7", "#818cf8"],
                    speaking: ["#d4d4d8", "#a1a1aa", "#71717a"],
                    thinking: ["#c084fc", "#818cf8", "#3f3f46"],
                    muted: ["#52525b", "#27272a", "#18181b"]
                },
                glow: {
                    listening: "rgba(255, 255, 255, 0.35)",
                    speaking: "rgba(161, 161, 170, 0.4)",
                    thinking: "rgba(192, 132, 252, 0.4)",
                    muted: "rgba(63, 63, 70, 0.2)"
                }
            },
            cyberpunk: {
                visualizerType: "spectrumAnalyzer",
                glowColor: "#00f0ff",
                colors: {
                    listening: ["#00f0ff", "#fcee0a", "#ff003c"],
                    speaking: ["#ff003c", "#ff2a85", "#00f0ff"],
                    thinking: ["#fcee0a", "#ff003c", "#ffe600"],
                    muted: ["#502040", "#201030", "#100820"]
                },
                glow: {
                    listening: "rgba(0, 240, 255, 0.55)",
                    speaking: "rgba(255, 0, 60, 0.55)",
                    thinking: "rgba(252, 238, 10, 0.55)",
                    muted: "rgba(80, 32, 64, 0.3)"
                }
            },
            matrix: {
                visualizerType: "spectrumAnalyzer",
                glowColor: "#22c55e",
                colors: {
                    listening: ["#86efac", "#22c55e", "#15803d"],
                    speaking: ["#4ade80", "#16a34a", "#14532d"],
                    thinking: ["#a7f3d0", "#10b981", "#047857"],
                    muted: ["#166534", "#14532d", "#052e16"]
                },
                glow: {
                    listening: "rgba(34, 197, 94, 0.5)",
                    speaking: "rgba(74, 222, 128, 0.45)",
                    thinking: "rgba(16, 185, 129, 0.5)",
                    muted: "rgba(22, 101, 52, 0.25)"
                }
            },
            synthwave: {
                visualizerType: "particleField",
                glowColor: "#ff2a85",
                colors: {
                    listening: ["#ff2a85", "#b5179e", "#00fffb"],
                    speaking: ["#00fffb", "#7209b7", "#ff2a85"],
                    thinking: ["#f72585", "#ff007f", "#4cc9f0"],
                    muted: ["#4a154b", "#2d0c30", "#18061a"]
                },
                glow: {
                    listening: "rgba(255, 42, 133, 0.55)",
                    speaking: "rgba(0, 255, 251, 0.55)",
                    thinking: "rgba(247, 37, 133, 0.55)",
                    muted: "rgba(74, 21, 75, 0.3)"
                }
            },
            aurora: {
                visualizerType: "sineRibbon",
                glowColor: "#2dd4bf",
                colors: {
                    listening: ["#2dd4bf", "#38bdf8", "#818cf8"],
                    speaking: ["#38bdf8", "#2dd4bf", "#a78bfa"],
                    thinking: ["#c084fc", "#38bdf8", "#2dd4bf"],
                    muted: ["#134e4a", "#0f3a38", "#082020"]
                },
                glow: {
                    listening: "rgba(45, 212, 191, 0.5)",
                    speaking: "rgba(56, 189, 248, 0.5)",
                    thinking: "rgba(192, 132, 252, 0.5)",
                    muted: "rgba(19, 78, 74, 0.25)"
                }
            },
            snowforest: {
                visualizerType: "organicBlob",
                glowColor: "#34d399",
                colors: {
                    listening: ["#34d399", "#6ee7b7", "#a7f3d0"],
                    speaking: ["#10b981", "#34d399", "#f0fdf4"],
                    thinking: ["#a7f3d0", "#34d399", "#059669"],
                    muted: ["#064e3b", "#065f46", "#022c22"]
                },
                glow: {
                    listening: "rgba(52, 211, 153, 0.55)",
                    speaking: "rgba(16, 185, 129, 0.5)",
                    thinking: "rgba(167, 243, 208, 0.55)",
                    muted: "rgba(6, 78, 59, 0.25)"
                }
            },
            nordic: {
                visualizerType: "radialAura",
                glowColor: "#2563eb",
                colors: {
                    listening: ["#2563eb", "#3b82f6", "#60a5fa"],
                    speaking: ["#1d4ed8", "#2563eb", "#93c5fd"],
                    thinking: ["#60a5fa", "#3b82f6", "#1e40af"],
                    muted: ["#94a3b8", "#64748b", "#475569"]
                },
                glow: {
                    listening: "rgba(37, 99, 235, 0.5)",
                    speaking: "rgba(29, 78, 216, 0.45)",
                    thinking: "rgba(96, 165, 250, 0.5)",
                    muted: "rgba(148, 163, 184, 0.25)"
                }
            },
            paper: {
                visualizerType: "sineRibbon",
                glowColor: "#c2410c",
                colors: {
                    listening: ["#c2410c", "#ea580c", "#f97316"],
                    speaking: ["#9a3412", "#c2410c", "#fb923c"],
                    thinking: ["#fb923c", "#f97316", "#7c2d12"],
                    muted: ["#78716c", "#57534e", "#44403c"]
                },
                glow: {
                    listening: "rgba(194, 65, 12, 0.5)",
                    speaking: "rgba(154, 52, 18, 0.45)",
                    thinking: "rgba(251, 146, 60, 0.5)",
                    muted: "rgba(120, 113, 108, 0.25)"
                }
            },
            alpineday: {
                visualizerType: "organicBlob",
                glowColor: "#2d6a4f",
                colors: {
                    listening: ["#2d6a4f", "#40916c", "#52b788"],
                    speaking: ["#1b4332", "#2d6a4f", "#74c69d"],
                    thinking: ["#52b788", "#40916c", "#081c15"],
                    muted: ["#6b705c", "#588157", "#344e41"]
                },
                glow: {
                    listening: "rgba(45, 106, 79, 0.5)",
                    speaking: "rgba(27, 67, 50, 0.45)",
                    thinking: "rgba(82, 183, 136, 0.5)",
                    muted: "rgba(107, 112, 92, 0.25)"
                }
            },
            pastel: {
                visualizerType: "sineRibbon",
                glowColor: "#ec4899",
                colors: {
                    listening: ["#ec4899", "#c084fc", "#818cf8"],
                    speaking: ["#f472b6", "#a78bfa", "#67e8f9"],
                    thinking: ["#c084fc", "#f472b6", "#fed7aa"],
                    muted: ["#cbd5e1", "#e2e8f0", "#f1f5f9"]
                },
                glow: {
                    listening: "rgba(236, 72, 153, 0.5)",
                    speaking: "rgba(244, 114, 182, 0.45)",
                    thinking: "rgba(192, 132, 252, 0.5)",
                    muted: "rgba(203, 213, 225, 0.25)"
                }
            },
            pastellilac: {
                visualizerType: "sineRibbon",
                glowColor: "#ec4899",
                colors: {
                    listening: ["#ec4899", "#c084fc", "#818cf8"],
                    speaking: ["#f472b6", "#a78bfa", "#67e8f9"],
                    thinking: ["#c084fc", "#f472b6", "#fed7aa"],
                    muted: ["#cbd5e1", "#e2e8f0", "#f1f5f9"]
                },
                glow: {
                    listening: "rgba(236, 72, 153, 0.5)",
                    speaking: "rgba(244, 114, 182, 0.45)",
                    thinking: "rgba(192, 132, 252, 0.5)",
                    muted: "rgba(203, 213, 225, 0.25)"
                }
            },
            pastelprisma: {
                visualizerType: "sineRibbon",
                glowColor: "#0d9488",
                colors: {
                    listening: ["#10b981", "#0284c7", "#f59e0b"],
                    speaking: ["#0284c7", "#8b5cf6", "#10b981"],
                    thinking: ["#f59e0b", "#f43f5e", "#8b5cf6"],
                    muted: ["#94a3b8", "#cbd5e1", "#e2e8f0"]
                },
                glow: {
                    listening: "rgba(16, 185, 129, 0.5)",
                    speaking: "rgba(2, 132, 199, 0.5)",
                    thinking: "rgba(245, 158, 11, 0.5)",
                    muted: "rgba(148, 163, 184, 0.25)"
                }
            },
            glacier: {
                visualizerType: "organicBlob",
                glowColor: "#0284c7",
                colors: {
                    listening: ["#0284c7", "#38bdf8", "#7dd3fc"],
                    speaking: ["#0369a1", "#0284c7", "#bae6fd"],
                    thinking: ["#38bdf8", "#7dd3fc", "#0c4a6e"],
                    muted: ["#94a3b8", "#64748b", "#475569"]
                },
                glow: {
                    listening: "rgba(2, 132, 199, 0.5)",
                    speaking: "rgba(3, 105, 161, 0.45)",
                    thinking: "rgba(56, 189, 248, 0.5)",
                    muted: "rgba(148, 163, 184, 0.25)"
                }
            },
            pirate: {
                visualizerType: "particleField",
                glowColor: "#d4af37",
                colors: {
                    listening: ["#d4af37", "#f59e0b", "#0d9488"],
                    speaking: ["#0d9488", "#d4af37", "#b45309"],
                    thinking: ["#f59e0b", "#d4af37", "#ef4444"],
                    muted: ["#78716c", "#57534e", "#292524"]
                },
                glow: {
                    listening: "rgba(212, 175, 55, 0.55)",
                    speaking: "rgba(13, 148, 136, 0.55)",
                    thinking: "rgba(245, 158, 11, 0.55)",
                    muted: "rgba(120, 113, 108, 0.25)"
                }
            },
            rainbowrave: {
                visualizerType: "rainbowExplosion",
                glowColor: "#ff007f",
                colors: {
                    listening: ["#ff0055", "#ff7700", "#ffea00", "#00ff66", "#00f0ff", "#9900ff", "#ff00aa"],
                    speaking: ["#ff0000", "#ff6600", "#ffff00", "#00ff00", "#00ffff", "#0055ff", "#aa00ff", "#ff0055"],
                    thinking: ["#ffffff", "#ffe600", "#ff0055", "#00ffff", "#ff00ea"],
                    muted: ["#502040", "#301040", "#100820"]
                },
                glow: {
                    listening: "rgba(0, 240, 255, 0.65)",
                    speaking: "rgba(255, 0, 128, 0.75)",
                    thinking: "rgba(255, 230, 0, 0.8)",
                    muted: "rgba(80, 32, 64, 0.3)"
                }
            }
        };
        return configs[theme] || configs.default;
    }

    drawSpeechOrb() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        const cfg = this.getThemeConfig();

        // Get microphone volume
        let micVolume = 0;
        if (this.analyser && !this.isMuted && this.state === "listening" && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                sum += this.dataArray[i];
            }
            micVolume = sum / (this.dataArray.length * 255);
        }

        // Smooth volume interpolation
        if (this.state === "speaking") {
            this.targetVolume = 0.35 + Math.sin(this.phase * 3.5) * 0.25;
        } else if (this.state === "thinking") {
            this.targetVolume = 0.15 + Math.sin(this.phase * 4.0) * 0.08;
        } else {
            this.targetVolume = micVolume;
        }

        this.currentVolume += (this.targetVolume - this.currentVolume) * 0.2;
        this.phase += 0.04;

        // Outer Radiant Glow Rings (Themed)
        const glowRadius = 75 + this.currentVolume * 65;
        const glowGrad = ctx.createRadialGradient(centerX, centerY, 30, centerX, centerY, glowRadius * 1.5);
        const activeGlow = cfg.glow[this.state] || cfg.glow.listening;

        glowGrad.addColorStop(0, activeGlow);
        glowGrad.addColorStop(0.7, "rgba(0,0,0,0)");

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Dispatch to Bespoke Theme Visualizer Mode
        const mode = cfg.visualizerType || "radialAura";
        if (mode === "spectrumAnalyzer") {
            this.drawSpectrumAnalyzer(ctx, width, height, centerX, centerY, this.currentVolume, cfg, this.dataArray);
        } else if (mode === "particleField") {
            this.drawParticleField(ctx, centerX, centerY, this.currentVolume, cfg);
        } else if (mode === "sineRibbon") {
            this.drawSineRibbon(ctx, width, height, centerX, centerY, this.currentVolume, cfg);
        } else if (mode === "organicBlob") {
            this.drawOrganicBlob(ctx, centerX, centerY, this.currentVolume, cfg);
        } else if (mode === "rainbowExplosion") {
            this.drawRainbowExplosion(ctx, width, height, centerX, centerY, this.currentVolume, cfg, this.dataArray);
        } else {
            this.drawRadialAura(ctx, centerX, centerY, this.currentVolume, cfg, this.dataArray);
        }
    }

    drawRadialAura(ctx, cx, cy, vol, cfg, freqs) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const baseR = 52 + vol * 28;

        ctx.save();
        const spikeCount = 36;
        const angleStep = (Math.PI * 2) / spikeCount;

        for (let i = 0; i < spikeCount; i++) {
            const angle = i * angleStep + this.phase * 0.4;
            const freqNorm = (freqs && freqs.length > 0)
                ? (freqs[i % freqs.length] / 255)
                : (0.25 + Math.sin(this.phase * 2.5 + i * 0.5) * 0.2);
            const spikeLen = 8 + (freqNorm * 45 + vol * 35);

            const x1 = cx + Math.cos(angle) * (baseR + 4);
            const y1 = cy + Math.sin(angle) * (baseR + 4);
            const x2 = cx + Math.cos(angle) * (baseR + 4 + spikeLen);
            const y2 = cy + Math.sin(angle) * (baseR + 4 + spikeLen);

            ctx.strokeStyle = colorSet[i % colorSet.length];
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Concentric acoustic wave ring
        const waveR = baseR + 24 + (Math.sin(this.phase * 3.2) * 0.5 + 0.5) * 16;
        ctx.strokeStyle = colorSet[0];
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Central Orb
        const grad = ctx.createRadialGradient(cx - baseR * 0.25, cy - baseR * 0.25, baseR * 0.1, cx, cy, baseR);
        grad.addColorStop(0, colorSet[0]);
        grad.addColorStop(0.65, colorSet[1]);
        grad.addColorStop(1, colorSet[2]);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fill();

        // Core Specular Glint
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath();
        ctx.arc(cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawSpectrumAnalyzer(ctx, w, h, cx, cy, vol, cfg, freqs) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const barCount = 24;
        const barWidth = 7;
        const gap = 4;
        const totalW = barCount * (barWidth + gap) - gap;
        const startX = cx - totalW / 2;
        const baseY = cy + 45;
        const maxH = 95;

        ctx.save();

        // Zero axis line
        ctx.strokeStyle = colorSet[1];
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(startX - 10, baseY + 2);
        ctx.lineTo(startX + totalW + 10, baseY + 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        for (let i = 0; i < barCount; i++) {
            const freqNorm = (freqs && freqs.length > 0)
                ? (freqs[i % freqs.length] / 255)
                : (0.2 + Math.sin(this.phase * 3.0 + i * 0.45) * 0.25 + vol * 0.5);

            const targetH = Math.min(maxH, Math.max(6, (freqNorm * 0.75 + vol * 0.5) * maxH));

            if (targetH > this.spectrumPeaks[i]) {
                this.spectrumPeaks[i] = targetH;
            } else {
                this.spectrumPeaks[i] = Math.max(0, this.spectrumPeaks[i] - 1.2);
            }

            const bx = startX + i * (barWidth + gap);

            // LED Segmented Blocks
            const segments = Math.floor(targetH / 8);
            for (let s = 0; s <= segments; s++) {
                const segY = baseY - s * 8;
                const normH = s / (maxH / 8);
                ctx.fillStyle = normH < 0.5 ? colorSet[0] : (normH < 0.8 ? colorSet[1] : colorSet[2]);
                ctx.fillRect(bx, segY - 6, barWidth, 6);
            }

            // Floating Peak Hold Cap
            const peakY = baseY - this.spectrumPeaks[i];
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(bx, peakY - 3, barWidth, 2);
        }
        ctx.restore();
    }

    drawParticleField(ctx, cx, cy, vol, cfg) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const PARTICLE_COUNT = 65;

        if (this.visualizerParticles.length === 0) {
            for (let p = 0; p < PARTICLE_COUNT; p++) {
                this.visualizerParticles.push({
                    angle: Math.random() * Math.PI * 2,
                    dist: 35 + Math.random() * 85,
                    baseDist: 35 + Math.random() * 85,
                    speed: 0.015 + Math.random() * 0.025,
                    size: 1.5 + Math.random() * 2.5,
                    colorIdx: p % colorSet.length
                });
            }
        }

        ctx.save();
        const pts = [];
        const isSurging = vol > 0.12 || this.state === "speaking";

        for (const p of this.visualizerParticles) {
            p.angle += p.speed * (1 + vol * 4.5);

            const targetDist = isSurging ? (25 + p.baseDist * 0.45) : p.baseDist;
            p.dist += (targetDist - p.dist) * 0.1;

            const px = cx + Math.cos(p.angle) * p.dist;
            const py = cy + Math.sin(p.angle) * p.dist;
            const curSize = p.size * (1 + vol * 1.5);
            pts.push({ x: px, y: py, size: curSize, color: colorSet[p.colorIdx] });
        }

        // Draw connective constellation web lines
        ctx.lineWidth = 0.9;
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const dx = pts[i].x - pts[j].x;
                const dy = pts[i].y - pts[j].y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 38) {
                    ctx.strokeStyle = pts[i].color;
                    ctx.globalAlpha = (1 - d / 38) * 0.55;
                    ctx.beginPath();
                    ctx.moveTo(pts[i].x, pts[i].y);
                    ctx.lineTo(pts[j].x, pts[j].y);
                    ctx.stroke();
                }
            }
        }

        // Draw particle nodes
        for (const pt of pts) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = pt.color;
            ctx.shadowColor = pt.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Central Energetic Nucleus
        const coreR = 18 + vol * 22;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        coreGrad.addColorStop(0, "#ffffff");
        coreGrad.addColorStop(0.4, colorSet[0]);
        coreGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawRainbowExplosion(ctx, w, h, cx, cy, vol, cfg, freqs) {
        const baseR = 54 + vol * 46;

        if (!this.rainbowParticles) this.rainbowParticles = [];
        const targetCount = 65 + Math.floor(vol * 85);

        while (this.rainbowParticles.length < targetCount) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2.5 + Math.random() * (7 + vol * 14);
            this.rainbowParticles.push({
                x: cx + Math.cos(angle) * (baseR * 0.45),
                y: cy + Math.sin(angle) * (baseR * 0.45),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2.2 + Math.random() * 4.5,
                hue: Math.floor(Math.random() * 360),
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03
            });
        }

        ctx.save();

        // 1. Multi-hue Shockwave Rings
        const ringCount = 5;
        for (let r = 0; r < ringCount; r++) {
            const ringR = baseR + r * (14 + vol * 24) + Math.sin(this.phase * 4 + r) * 8;
            const ringHue = (this.phase * 60 + r * 50) % 360;
            ctx.strokeStyle = `hsla(${ringHue}, 100%, 65%, ${0.5 + vol * 0.5 - r * 0.08})`;
            ctx.lineWidth = 3.5 - r * 0.5;
            ctx.shadowColor = `hsl(${ringHue}, 100%, 50%)`;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 2. Chromatic Rays
        const rayCount = 48;
        const angleStep = (Math.PI * 2) / rayCount;
        for (let i = 0; i < rayCount; i++) {
            const angle = i * angleStep + this.phase * 0.6;
            const freqNorm = (freqs && freqs.length > 0)
                ? (freqs[i % freqs.length] / 255)
                : (0.3 + Math.sin(this.phase * 5 + i * 0.4) * 0.25);
            const rayLen = 12 + (freqNorm * 65 + vol * 52);

            const x1 = cx + Math.cos(angle) * (baseR + 4);
            const y1 = cy + Math.sin(angle) * (baseR + 4);
            const x2 = cx + Math.cos(angle) * (baseR + 4 + rayLen);
            const y2 = cy + Math.sin(angle) * (baseR + 4 + rayLen);

            const rayHue = (this.phase * 80 + i * 8) % 360;
            ctx.strokeStyle = `hsl(${rayHue}, 100%, 60%)`;
            ctx.lineWidth = 3 + vol * 2.2;
            ctx.lineCap = "round";
            ctx.shadowColor = `hsl(${rayHue}, 100%, 50%)`;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // 3. Confetti Particles
        for (let p = this.rainbowParticles.length - 1; p >= 0; p--) {
            const part = this.rainbowParticles[p];
            part.x += part.vx;
            part.y += part.vy;
            part.hue = (part.hue + 5) % 360;
            part.life -= part.decay;

            if (part.life <= 0) {
                this.rainbowParticles.splice(p, 1);
                continue;
            }

            ctx.fillStyle = `hsla(${part.hue}, 100%, 70%, ${part.life})`;
            ctx.shadowColor = `hsl(${part.hue}, 100%, 50%)`;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(part.x, part.y, part.size * (1 + vol), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawSineRibbon(ctx, w, h, cx, cy, vol, cfg) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const ribbonCount = 4;
        const ribbonWidth = w * 0.75;
        const startX = cx - ribbonWidth / 2;
        const endX = cx + ribbonWidth / 2;

        ctx.save();

        for (let r = 0; r < ribbonCount; r++) {
            const rb = {
                phase: this.phase * (2.0 + r * 0.6) + r * 1.8,
                freq: 0.012 + r * 0.004,
                amp: (18 + r * 8) * (1 + vol * 3.8),
                height: 12 + r * 4,
                color: colorSet[r % colorSet.length],
                alpha: 0.28 + (r / ribbonCount) * 0.35
            };

            ctx.beginPath();
            for (let x = startX; x <= endX; x += 6) {
                const norm = (x - startX) / ribbonWidth;
                const windowEnvelope = Math.sin(norm * Math.PI);
                const y = cy + Math.sin(x * rb.freq + rb.phase) * (rb.amp * windowEnvelope)
                             + Math.cos(x * 0.009 - rb.phase * 0.5) * (rb.amp * 0.35 * windowEnvelope);
                if (x === startX) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            for (let x = endX; x >= startX; x -= 6) {
                const norm = (x - startX) / ribbonWidth;
                const windowEnvelope = Math.sin(norm * Math.PI);
                const y = cy + Math.sin(x * rb.freq + rb.phase) * (rb.amp * windowEnvelope)
                             + Math.cos(x * 0.009 - rb.phase * 0.5) * (rb.amp * 0.35 * windowEnvelope)
                             + rb.height * (1 + vol * 0.8) * windowEnvelope;
                ctx.lineTo(x, y);
            }
            ctx.closePath();

            ctx.fillStyle = rb.color;
            ctx.globalAlpha = rb.alpha;
            ctx.fill();

            ctx.strokeStyle = rb.color;
            ctx.lineWidth = 1.8;
            ctx.globalAlpha = Math.min(1.0, rb.alpha + 0.3);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, 6 + vol * 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawOrganicBlob(ctx, cx, cy, vol, cfg) {
        const colorSet = cfg.colors[this.state] || cfg.colors.listening;
        const points = 12;
        const angleStep = (Math.PI * 2) / points;
        const baseR = 56 + vol * 34;

        ctx.save();

        // Outer Liquid Halo
        ctx.beginPath();
        const outerCoords = [];
        for (let i = 0; i < points; i++) {
            const angle = i * angleStep;
            const wave = Math.sin(this.phase * 2.2 + i * 1.4) * (vol * 22 + 8)
                       + Math.cos(this.phase * 1.6 - i * 2.0) * (vol * 14 + 6);
            const r = baseR + 18 + wave;
            outerCoords.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
        }
        ctx.moveTo((outerCoords[0].x + outerCoords[points - 1].x) / 2, (outerCoords[0].y + outerCoords[points - 1].y) / 2);
        for (let i = 0; i < points; i++) {
            const curr = outerCoords[i];
            const next = outerCoords[(i + 1) % points];
            ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
        }
        ctx.closePath();
        ctx.fillStyle = colorSet[1];
        ctx.globalAlpha = 0.28;
        ctx.fill();

        // Main Liquid Body
        ctx.beginPath();
        const coords = [];
        for (let i = 0; i < points; i++) {
            const angle = i * angleStep;
            const wave = Math.sin(this.phase * 3.0 + i * 1.6) * (vol * 28 + 10)
                       + Math.cos(-this.phase * 2.4 + i * 2.2) * (vol * 18 + 7);
            const r = baseR + wave;
            coords.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
        }
        ctx.moveTo((coords[0].x + coords[points - 1].x) / 2, (coords[0].y + coords[points - 1].y) / 2);
        for (let i = 0; i < points; i++) {
            const curr = coords[i];
            const next = coords[(i + 1) % points];
            ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
        }
        ctx.closePath();

        const grad = ctx.createRadialGradient(cx - baseR * 0.25, cy - baseR * 0.25, 10, cx, cy, baseR * 1.2);
        grad.addColorStop(0, colorSet[0]);
        grad.addColorStop(0.6, colorSet[1]);
        grad.addColorStop(1, colorSet[2]);

        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.95;
        ctx.fill();

        // Specular highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.beginPath();
        ctx.arc(cx - baseR * 0.32, cy - baseR * 0.32, 12 + vol * 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

window.VoiceVisualizer = VoiceVisualizer;

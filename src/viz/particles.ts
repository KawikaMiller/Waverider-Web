import { css, hsv, hueOf, parseHex } from "../color";
import type { Visualizer } from "./types";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; hue: number;
}

export class ParticleVisualizer implements Visualizer {
  readonly name = "Particles";
  private particles: Particle[] = [];
  private lastTime = 0;

  render: Visualizer["render"] = (ctx, w, h, frame, theme, t) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const dt = Math.min(0.05, Math.max(0, t - this.lastTime));
    this.lastTime = t;

    const secondary = parseHex(theme.secondary);
    const baseHue = hueOf(parseHex(theme.primary));
    const scale = Math.min(w, h) / 600; // the desktop sizes assume a window of roughly this height

    // Beats spawn bursts; bigger beats spawn more, faster particles.
    if (frame.beat > 0.5) {
      const count = Math.floor(10 + frame.beat * 30);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (90 + Math.random() * 320 * frame.beat) * scale;
        const life = 1.4 + Math.random() * 0.6;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * 24 * scale, y: cy + (Math.random() - 0.5) * 24 * scale,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          maxLife: life, life, size: (2.5 + Math.random() * 4.5) * scale,
          hue: baseHue + ((t * 25 + Math.random() * 80) % 360),
        });
      }
    }

    // A trickle of ambient particles driven by mid energy.
    if (frame.mid > 0.25 && Math.random() < frame.mid * 0.6) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (30 + Math.random() * 80) * scale;
      this.particles.push({
        x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        maxLife: 2, life: 2, size: (1.5 + Math.random() * 2) * scale, hue: baseHue + ((t * 40) % 360),
      });
    }

    const drag = 0.96;
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
      return p.life > 0 && p.x > -50 && p.x < w + 50 && p.y > -50 && p.y < h + 50;
    });
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);

    ctx.globalCompositeOperation = "lighter";

    // A faint centre glow that pulses with the bass.
    const glowR = Math.min(w, h) * 0.25 * (1 + frame.bass * 0.6);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0, css(secondary, (120 * frame.bass) / 255));
    glow.addColorStop(1, css(secondary, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    ctx.fill();

    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      const color = hsv(p.hue, 0.85, 1);
      ctx.fillStyle = css(color, alpha * 0.43); // soft halo
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + 5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };
}

import * as THREE from 'three';

type Line = { key: string; text: string; until: number; at: () => { x: number; y: number; z: number } | null; tone: 'say' | 'shout' };

/**
 * Small speech bubbles over characters. Each phrase is rendered to a canvas texture once and
 * cached; only the nearest few bubbles are shown so a busy street stays readable and cheap.
 */
export function createBubbles(scene: THREE.Scene) {
  const MAX_VISIBLE = 9;
  const textures = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();
  const lines = new Map<string, Line>();
  const sprites = Array.from({ length: MAX_VISIBLE }, () => {
    const material = new THREE.SpriteMaterial({ depthWrite: false, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 30;
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, material };
  });

  function texture(text: string, tone: Line['tone']) {
    const cacheKey = `${tone}:${text}`;
    let entry = textures.get(cacheKey);
    if (entry) return entry;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = `${tone === 'shout' ? 800 : 600} 30px Arial, sans-serif`;
    ctx.font = font;
    // Wrap into at most two lines of ~22 characters.
    const words = text.split(' ');
    const rows: string[] = [''];
    for (const word of words) {
      const candidate = rows[rows.length - 1] ? `${rows[rows.length - 1]} ${word}` : word;
      if (ctx.measureText(candidate).width > 380 && rows[rows.length - 1] && rows.length < 2) rows.push(word);
      else rows[rows.length - 1] = candidate;
    }
    const width = Math.min(420, Math.max(...rows.map((r) => ctx.measureText(r).width)) + 40);
    const height = rows.length * 38 + 34;
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height + 16);
    ctx.font = font;
    ctx.fillStyle = tone === 'shout' ? '#fff1e8' : '#fffdf6';
    ctx.strokeStyle = tone === 'shout' ? '#c0392b' : '#2f4a3e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(2, 2, width - 4, height - 4, 18);
    ctx.moveTo(width / 2 - 12, height - 3);
    ctx.lineTo(width / 2, height + 13);
    ctx.lineTo(width / 2 + 12, height - 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tone === 'shout' ? '#a12b1d' : '#233b32';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    rows.forEach((row, i) => ctx.fillText(row, width / 2, 20 + 19 + i * 38));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    entry = { texture: tex, aspect: canvas.width / canvas.height };
    if (textures.size > 80) {
      const oldest = textures.keys().next().value!;
      textures.get(oldest)!.texture.dispose();
      textures.delete(oldest);
    }
    textures.set(cacheKey, entry);
    return entry;
  }

  const candidates: { line: Line; d: number; x: number; y: number; z: number }[] = [];
  return {
    /** Shows `text` above whatever `at` points to for `duration` ms; a speaker has one bubble at a time. */
    say(key: string, text: string, now: number, at: Line['at'], duration = 3200, tone: Line['tone'] = 'say') {
      lines.set(key, { key, text, until: now + duration, at, tone });
    },
    speaking(key: string, now: number) { const line = lines.get(key); return !!line && line.until > now; },
    update(now: number, focusX: number, focusZ: number) {
      candidates.length = 0;
      for (const [key, line] of lines) {
        if (now > line.until) { lines.delete(key); continue; }
        const p = line.at();
        if (!p) continue;
        const d = Math.hypot(p.x - focusX, p.z - focusZ);
        if (d < 38) candidates.push({ line, d, x: p.x, y: p.y, z: p.z });
      }
      candidates.sort((a, b) => a.d - b.d);
      sprites.forEach((slot, i) => {
        const c = candidates[i];
        slot.sprite.visible = !!c;
        if (!c) return;
        const entry = texture(c.line.text, c.line.tone);
        if (slot.material.map !== entry.texture) { slot.material.map = entry.texture; slot.material.needsUpdate = true; }
        const h = 0.85;
        slot.sprite.scale.set(h * entry.aspect, h, 1);
        slot.sprite.position.set(c.x, c.y + h * 0.5, c.z);
        slot.material.opacity = Math.min(1, (c.line.until - now) / 300);
      });
    },
    dispose() {
      for (const slot of sprites) { scene.remove(slot.sprite); slot.material.dispose(); }
      textures.forEach((entry) => entry.texture.dispose());
      textures.clear();
    },
  };
}

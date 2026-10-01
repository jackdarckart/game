export function createRenderer(canvas, engine) {
  const ctx = canvas.getContext('2d');
  let time = 0;

  function render() {
    time += 0.015;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(34,211,238,.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

    const cx = width / 2;
    const cy = height / 2;
    const pulse = 1 + Math.sin(time * 2) * 0.04;

    for (let ring = 0; ring < 5; ring++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (70 + ring * 48) * pulse, time + ring * .7, time + Math.PI * 1.55 + ring * .7);
      ctx.strokeStyle = `rgba(34,211,238,${0.18 - ring * 0.025})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
    gradient.addColorStop(0, 'rgba(217,70,239,.8)');
    gradient.addColorStop(.25, 'rgba(34,211,238,.28)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, 130, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e5f6ff';
    ctx.font = '700 22px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SINGULARITY', cx, cy - 6);
    ctx.font = '14px Share Tech Mono, monospace';
    ctx.fillStyle = 'rgba(165,243,252,.8)';
    ctx.fillText(`${Math.floor(engine.state.vibeScore).toLocaleString('de-DE')} VIBE`, cx, cy + 22);

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
  return { render };
}

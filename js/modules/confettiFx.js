/**
 * 班級經營系統 3.0 - 全螢幕絢麗彩帶彩紙特效引擎 (Confetti Engine)
 * 輕量純 Canvas 粒子動畫，極致流暢 60FPS，零外部依賴
 */

let activeCanvas = null;
let animationFrameId = null;

export function triggerConfetti(options = {}) {
    if (typeof window === 'undefined' || !document.body) return;

    // 清理先前的動畫畫布
    if (activeCanvas && activeCanvas.parentNode) {
        cancelAnimationFrame(animationFrameId);
        activeCanvas.parentNode.removeChild(activeCanvas);
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'fixed inset-0 pointer-events-none z-[9999]';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    document.body.appendChild(canvas);
    activeCanvas = canvas;

    const colors = [
        '#F59E0B', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6',
        '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#EAB308'
    ];

    const particleCount = options.count || (window.innerWidth < 640 ? 60 : 120);
    const originX = options.x !== undefined ? options.x : window.innerWidth / 2;
    const originY = options.y !== undefined ? options.y : window.innerHeight * 0.45;

    const particles = [];
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 12 + 4;
        particles.push({
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - (Math.random() * 6 + 3),
            size: Math.random() * 8 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 12,
            shape: Math.random() > 0.4 ? 'rect' : 'circle',
            opacity: 1,
            decay: Math.random() * 0.012 + 0.008
        });
    }

    const gravity = 0.35;
    const drag = 0.96;
    let startTime = performance.now();

    function render(currentTime) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        let aliveCount = 0;
        particles.forEach(p => {
            if (p.opacity <= 0) return;
            aliveCount++;

            p.vx *= drag;
            p.vy *= drag;
            p.vy += gravity;

            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.opacity -= p.decay;

            if (p.opacity > 0) {
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.opacity);
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;

                if (p.shape === 'rect') {
                    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        });

        if (aliveCount > 0 && currentTime - startTime < 3500) {
            animationFrameId = requestAnimationFrame(render);
        } else {
            if (canvas && canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
            if (activeCanvas === canvas) {
                activeCanvas = null;
            }
        }
    }

    animationFrameId = requestAnimationFrame(render);
}

if (typeof window !== 'undefined') {
    window.triggerConfetti = triggerConfetti;
}

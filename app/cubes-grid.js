/* <cubes-grid> — a tilting cube field that follows the cursor, with a ripple on click.

   Adapted from the React Bits "Cubes" component (JS + CSS variant), itself inspired
   by Can Tastemel's work for the lambda.ai landing page (https://cantastemel.com).
   Three changes for this project:
     · no `gsap`, no CSS transitions, no timers — tilt and ripple are both read out of
       one rAF loop, which is the only way ~700 cubes stay smooth. A transition on
       `background-color` across two thousand faces is a paint storm; a colour ramp
       written on a step change is not;
     · it covers its container instead of being a fixed square, so it can sit behind a
       full page: columns and rows come from the container and a target cube size;
     · the scene is pinned to `direction:ltr` so a column index means the same place
       in Arabic as in English.

   Pointer tracking is on `window`, so the host stays pointer-events:none and the field
   still reacts under the headline and the footer rail.

   Attributes: cube, gap, max-angle, radius, face, border, ripple, ripple-speed,
   auto-animate, ripple-on-click. */
(function () {
  if (customElements.get('cubes-grid')) return;

  const CSS = `
cubes-grid{display:block;position:relative;width:100%;height:100%;overflow:hidden}
cubes-grid .cg-scene{position:absolute;inset:0;display:grid;perspective:99999999px;direction:ltr}
cubes-grid .cg-cube{position:relative;width:100%;height:100%;transform-style:preserve-3d}
cubes-grid .cg-face{position:absolute;inset:0;background:var(--cg-bg,var(--cg-face,#1E1F1F));border:1px solid var(--cg-bc,rgb(255 255 255 / .14))}
cubes-grid .cg-top{transform:translateY(-50%) rotateX(90deg)}
cubes-grid .cg-left{transform:translateX(-50%) rotateY(-90deg)}
cubes-grid .cg-front{transform:rotateY(-90deg) translateX(50%) rotateY(90deg)}
`;

  const num = (v, d) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };

  const rgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [30, 31, 31];
  };

  /* Pre-blended opaque steps. Opaque means no alpha compositing per face, and a
     lookup means the loop writes a string it already has. */
  const ramp = (from, to, n) => {
    const a = rgb(from);
    const b = rgb(to);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      out.push('rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
        Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
        Math.round(a[2] + (b[2] - a[2]) * t) + ')');
    }
    return out;
  };

  const STEPS = 10;

  class CubesGrid extends HTMLElement {
    connectedCallback() {
      if (this._booted) return;
      this._booted = true;

      if (!document.getElementById('cg-style')) {
        const st = document.createElement('style');
        st.id = 'cg-style';
        st.textContent = CSS;
        document.head.appendChild(st);
      }

      this._reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this._scene = document.createElement('div');
      this._scene.className = 'cg-scene';
      this.appendChild(this._scene);

      this._cubes = [];
      this._cols = 0;
      this._rows = 0;
      this._focus = { c: -999, r: -999 };
      this._idleAt = performance.now();
      this._sim = { x: 0, y: 0, tx: 0, ty: 0 };
      this._rip = null;

      this._onMove = (e) => {
        const rect = this._rect || (this._rect = this.getBoundingClientRect());
        if (!rect.width || !rect.height) return;
        this._focus.c = (e.clientX - rect.left) / (rect.width / this._cols);
        this._focus.r = (e.clientY - rect.top) / (rect.height / this._rows);
        this._idleAt = performance.now();
      };
      this._onLeave = () => { this._focus.c = -999; this._focus.r = -999; };
      this._onClick = (e) => {
        if (this.getAttribute('ripple-on-click') === 'false') return;
        const rect = this._rect || (this._rect = this.getBoundingClientRect());
        this.ripple(
          (e.clientX - rect.left) / (rect.width / this._cols),
          (e.clientY - rect.top) / (rect.height / this._rows)
        );
      };
      this._onScroll = () => { this._rect = null; };
      window.addEventListener('pointermove', this._onMove, { passive: true });
      window.addEventListener('click', this._onClick);
      window.addEventListener('scroll', this._onScroll, { passive: true });
      document.addEventListener('pointerleave', this._onLeave, { passive: true });

      this._ro = new ResizeObserver(() => {
        if (this._roRaf) return;
        this._roRaf = requestAnimationFrame(() => { this._roRaf = 0; this._rect = null; this._build(); });
      });
      this._ro.observe(this);
      this._build();

      this._prev = performance.now();
      this._loop = this._loop.bind(this);
      this._raf = requestAnimationFrame(this._loop);
    }

    disconnectedCallback() {
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._roRaf) cancelAnimationFrame(this._roRaf);
      if (this._ro) this._ro.disconnect();
      window.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('click', this._onClick);
      window.removeEventListener('scroll', this._onScroll);
      document.removeEventListener('pointerleave', this._onLeave);
      this._booted = false;
    }

    _build() {
      const w = this.clientWidth || 1;
      const h = this.clientHeight || 1;
      const target = Math.max(14, num(this.getAttribute('cube'), 104));
      const gap = num(this.getAttribute('gap'), 14);
      let cols = Math.max(2, Math.round(w / (target + gap)));
      let cell = w / cols;
      let rows = Math.max(2, Math.ceil(h / cell));
      /* A small cube size can ask for thousands of nodes; cap the field and grow the
         cubes back instead of shipping a page that drops frames. */
      const CAP = 700;
      while (cols * rows > CAP && cols > 4) {
        cols -= 1;
        cell = w / cols;
        rows = Math.max(2, Math.ceil(h / cell));
      }

      const face = this.getAttribute('face') || '#1E1F1F';
      const ink = this.getAttribute('ripple') || '#FDC20B';
      this._fill = ramp(face, ink, STEPS);
      this._edge = ramp('#4A4B4B', ink, STEPS);
      this.style.setProperty('--cg-face', face);

      if (cols === this._cols && rows === this._rows) return;
      this._cols = cols;
      this._rows = rows;
      this._scene.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
      this._scene.style.gridTemplateRows = 'repeat(' + rows + ',1fr)';
      this._scene.style.columnGap = gap + 'px';
      this._scene.style.rowGap = gap + 'px';
      this._scene.textContent = '';
      this._cubes = [];

      const faces = ['front', 'top', 'left'];
      const frag = document.createDocumentFragment();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cube = document.createElement('div');
          cube.className = 'cg-cube';
          for (const f of faces) {
            const el = document.createElement('div');
            el.className = 'cg-face cg-' + f;
            cube.appendChild(el);
          }
          frag.appendChild(cube);
          this._cubes.push({ el: cube, r, c, a: 0, lvl: 0 });
        }
      }
      this._scene.appendChild(frag);
    }

    /* A ring travelling out from the click at a constant speed, read out of the same
       loop as the tilt — no timers, no transitions, so only the few cubes inside the
       band are ever written. */
    ripple(col, row) {
      const speed = Math.max(0.2, num(this.getAttribute('ripple-speed'), 2));
      this._rip = {
        c: col,
        r: row,
        t0: performance.now(),
        speed: 16 * speed,
        band: 4.2,
        max: Math.hypot(Math.max(col, this._cols - col), Math.max(row, this._rows - row)),
      };
    }

    _loop(now) {
      this._raf = requestAnimationFrame(this._loop);
      if (!this._cubes.length) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - this._prev) / 1000));
      this._prev = now;

      const maxAngle = num(this.getAttribute('max-angle'), 45);
      const radius = Math.max(0.5, num(this.getAttribute('radius'), 3));

      let fc = this._focus.c;
      let fr = this._focus.r;
      const idle = now - this._idleAt > 2600;
      if (idle && this.getAttribute('auto-animate') !== 'false' && !this._reduced) {
        const s = this._sim;
        if (Math.hypot(s.x - s.tx, s.y - s.ty) < 0.4) {
          s.tx = Math.random() * this._cols;
          s.ty = Math.random() * this._rows;
        }
        const kk = 1 - Math.exp(-dt / 1.6);
        s.x += (s.tx - s.x) * kk;
        s.y += (s.ty - s.y) * kk;
        fc = s.x;
        fr = s.y;
      } else if (idle) {
        fc = -999; fr = -999;
      }

      const rip = this._rip;
      let front = 0;
      if (rip) {
        front = (now - rip.t0) / 1000 * rip.speed;
        if (front - rip.band > rip.max) this._rip = null;
      }

      const fill = this._fill;
      const edge = this._edge;
      const last = STEPS - 1;

      /* Hot path: ~700 cubes, sixty times a second. Every write here costs a style
         recalc on three faces, so a cube that is outside the tilt radius, outside the
         ripple band and already at rest is skipped before any square root. */
      for (const cu of this._cubes) {
        const dx = cu.c - fc;
        const dy = cu.r - fr;
        const near = dx > -radius && dx < radius && dy > -radius && dy < radius;

        let lit = 0;
        if (rip) {
          const rd = Math.sqrt((cu.c - rip.c) * (cu.c - rip.c) + (cu.r - rip.r) * (cu.r - rip.r));
          const off = Math.abs(rd - front);
          if (off < rip.band) {
            const p = 1 - off / rip.band;
            lit = p * p * (3 - 2 * p);
          }
        }

        if (!near && !lit && cu.a === 0 && cu.lvl === 0) continue;

        let pct = 0;
        if (near) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < radius) pct = 1 - d / radius;
        }

        const lvl = Math.round(Math.max(pct, lit) * last);
        if (lvl !== cu.lvl) {
          cu.lvl = lvl;
          const s = cu.el.style;
          if (lvl) {
            s.setProperty('--cg-bc', edge[lvl]);
            s.setProperty('--cg-bg', lit > pct ? fill[lvl] : '');
          } else {
            s.removeProperty('--cg-bc');
            s.removeProperty('--cg-bg');
          }
        }

        /* The tilt is not eased: the ask is the cube directly under the cursor, so the
           angle is whatever the distance says this frame. */
        const t = pct * maxAngle;
        if (t !== cu.a) {
          cu.a = t;
          cu.el.style.transform = t ? 'rotateX(' + -t + 'deg) rotateY(' + t + 'deg)' : '';
        }
      }
    }
  }

  customElements.define('cubes-grid', CubesGrid);
})();

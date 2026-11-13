/* wow.js: choreography runtime for the `wow` skill.
   Needs (vendored, loaded before this file): gsap, ScrollTrigger, SplitText; lenis optional.
   Everything is driven by data attributes so pages stay plain HTML:

   data-wow="chars"   per-letter tilt-in (headlines, display words)
   data-wow="lines"   masked line rise (statements, paragraphs)
   data-wow="fade"    opacity + small rise (labels, buttons, small blocks)
   data-wow="wipe"    diagonal image wipe with inner zoom-out (figures: put the <img> as first child)
   data-wow="draw"    SVG strokes draw in, scrubbed with scroll (put on <svg>, strokes need pathLength="1")
   data-wow-delay="0.2"           extra delay in seconds
   data-wow-parallax="10"         yPercent drift, + moves against scroll, - moves with it
   data-wow-handoff="disc"        section's ground grows as a disc over the previous act's ground (content never covered)
   <ol data-wow-stops>            beside a data-wow="draw" svg: li[data-at="0..1"] are placed on its path
   data-wow-pin="4"               (desktop) pins the section's [data-wow-stage] (100vh) for N viewports;
                                  children with data-wow-step get .is-on one after another
   .wow-seam                      zero-height element between sections; its .wow-cut children paint over both acts
   [data-wow-badge]               rotates continuously, spins faster with scroll velocity
   [data-wow-progress]            gets --p (0..1) page progress
   data-wow-theme="dark"          while this section is under the chrome, <html> has .wow-dark (still mode too)
   video[data-wow-autoplay]       muted loop video started only when motion is allowed (never use `autoplay`)
   [data-wow-loader]              preloader: holds, then opens a shape on the hero, then removes itself
*/
(() => {
  const { gsap, ScrollTrigger, SplitText } = window;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desk = matchMedia("(min-width: 900px)").matches;
  const root = document.documentElement;
  root.classList.add("wow-js");

  // Shared constants (measured on the reference build; change per brand only with reason).
  const DUR = { s: 0.4, m: 0.8, l: 1.2 };
  const EASE = { out: "wowOut", inOut: "wowInOut" };
  const loader = document.querySelector("[data-wow-loader]");

  // Chrome ink follows the ground under it. Not motion, so it runs in still mode too (no GSAP needed):
  // a 1px band at y=40 tells which act sits under the chrome.
  const darks = document.querySelectorAll('[data-wow-theme="dark"]');
  if (darks.length && "IntersectionObserver" in window) {
    const under = new Set();
    const io = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? under.add(e.target) : under.delete(e.target)); root.classList.toggle("wow-dark", under.size > 0); },
      { rootMargin: `-40px 0px ${-(innerHeight - 41)}px 0px` });
    darks.forEach(d => io.observe(d));
  }

  if (reduced || !gsap || !ScrollTrigger || !SplitText) {
    loader?.remove();
    root.classList.add("wow-still");
    return;
  }
  // ambient video plays only with motion allowed (no `autoplay` attribute in the HTML; posters cover still mode)
  document.querySelectorAll("video[data-wow-autoplay]").forEach(v => { v.muted = true; v.play().catch(() => {}); });

  gsap.registerPlugin(ScrollTrigger, SplitText);
  // cubic-bezier(.25,1,.5,1) and (.75,0,.25,1) from the reference build ≈ power3.out / power3.inOut
  gsap.registerEase("wowOut", gsap.parseEase("power3.out"));
  gsap.registerEase("wowInOut", gsap.parseEase("power3.inOut"));

  // Smooth wheel (desktop pointer only). Lenis duration 1.2 + expo-out is the measured feel.
  let lenis = null;
  if (window.Lenis && matchMedia("(pointer: fine)").matches) {
    lenis = new Lenis({ duration: 1.2, smoothWheel: true, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    // in-page anchors go through lenis so they ease instead of jumping
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute("href").length < 2) return;
      const t = document.querySelector(a.getAttribute("href"));
      if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: 0 }); t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
    });
  }
  window.wow = { lenis, gsap, ScrollTrigger };

  // ---------- pinned step sequences (desktop) ----------
  // Created FIRST: ScrollTrigger measures in creation order, so any trigger made before a pin
  // ignores that pin's spacer and fires viewports too early.
  document.querySelectorAll("[data-wow-pin]").forEach(sec => {
    const steps = [...sec.querySelectorAll("[data-wow-step]")];
    const set = i => { steps.forEach((s, k) => s.classList.toggle("is-on", k === i)); sec.style.setProperty("--step", i); sec.dataset.step = i; };
    set(0);
    if (!desk) { steps.forEach(s => s.classList.add("is-on")); return; }
    const n = parseFloat(sec.dataset.wowPin) || steps.length;
    const stage = sec.querySelector("[data-wow-stage]") || sec; // pin the 100vh stage, not the section
    ScrollTrigger.create({ trigger: stage, start: "top top", end: `+=${n * 100}%`, pin: stage, scrub: true,
      onUpdate: st => { set(Math.min(steps.length - 1, Math.floor(st.progress * steps.length))); sec.style.setProperty("--pp", st.progress.toFixed(3)); } });
  });

  // ---------- entrance reveals (play once, on enter) ----------
  const rise = desk ? "3.3rem" : "2rem";
  // aria-label only names headings, links and buttons; on a span or p it is ignored and the split text
  // would vanish for screen readers. Those get aria-hidden plus a visually hidden copy instead.
  const aria = el => {
    if (el.matches("h1,h2,h3,h4,h5,h6,a,button")) return "auto";
    el.insertAdjacentHTML("afterend", `<span class="wow-sr">${el.textContent.trim().replace(/</g, "&lt;")}</span>`);
    return "hidden";
  };
  const setups = {
    chars(el) {
      const s = new SplitText(el, { type: "words,chars", charsClass: "wow-ch", wordsClass: "wow-w", aria: aria(el) });
      const n = s.chars.length, st = Math.min(0.06, 0.7 / n);
      gsap.set(el, { perspective: 600 });
      gsap.set(s.chars, { opacity: 0, rotateX: -90, x: "-0.6em", transformOrigin: "50% 0%" });
      return d => gsap.to(s.chars, { opacity: 1, rotateX: 0, x: 0, duration: DUR.l, ease: EASE.out, stagger: st, delay: d });
    },
    lines(el) {
      const s = new SplitText(el, { type: "lines", mask: "lines", linesClass: "wow-ln", aria: aria(el) });
      gsap.set(s.lines, { yPercent: 110 });
      return d => gsap.to(s.lines, { yPercent: 0, duration: DUR.l, ease: EASE.out, stagger: 0.1, delay: d });
    },
    fade(el) {
      gsap.set(el, { opacity: 0, y: rise });
      return d => gsap.to(el, { opacity: 1, y: 0, duration: DUR.l, ease: EASE.out, delay: d });
    },
    wipe(el) {
      const img = el.firstElementChild;
      gsap.set(el, { clipPath: "polygon(100% 0%, 100% 0%, 101% 100%, 125% 100%)" });
      if (img) gsap.set(img, { scale: 1.5, xPercent: 25 });
      return d => {
        gsap.to(el, { clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)", duration: DUR.l * 1.25, ease: EASE.inOut, delay: d });
        if (img) gsap.to(img, { scale: 1, xPercent: 0, duration: DUR.l * 1.25, ease: EASE.inOut, delay: d });
      };
    },
  };
  const held = []; // reveals inside the hero wait for the loader
  document.querySelectorAll("[data-wow]").forEach(el => {
    const kind = el.dataset.wow;
    if (kind === "draw") return;
    const make = setups[kind]; if (!make) return;
    const play = make(el);
    const d = 0.3 + parseFloat(el.dataset.wowDelay || 0);
    if (loader && el.closest("[data-wow-hero]")) { held.push(() => play(d)); return; }
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => play(d) });
  });

  // ---------- scrubbed strokes ----------
  document.querySelectorAll('[data-wow="draw"]').forEach(svg => {
    const paths = svg.querySelectorAll("[pathLength]");
    gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.to(paths, { strokeDashoffset: 0, ease: "none", stagger: 0.15,
      scrollTrigger: { trigger: svg, start: "top 85%", end: "bottom 45%", scrub: 0.5 } });
  });

  // ---------- route stops sit on the drawn line: <ol data-wow-stops> next to the svg, li[data-at="0..1"] ----------
  document.querySelectorAll("[data-wow-stops]").forEach(ol => {
    const box = ol.parentElement, path = box.querySelector('[data-wow="draw"] path');
    if (!path) return;
    const lay = () => {
      if (getComputedStyle(path.ownerSVGElement).display === "none") return;
      const b = box.getBoundingClientRect(), len = path.getTotalLength(), m = path.getScreenCTM();
      ol.querySelectorAll("li[data-at]").forEach(li => {
        const pt = path.getPointAtLength(len * parseFloat(li.dataset.at)).matrixTransform(m);
        li.style.left = pt.x - b.left + "px"; li.style.top = pt.y - b.top + "px";
      });
    };
    lay(); ScrollTrigger.addEventListener("refresh", lay);
  });

  // ---------- parallax planes ----------
  document.querySelectorAll("[data-wow-parallax]").forEach(el => {
    const a = parseFloat(el.dataset.wowParallax) || 10;
    gsap.fromTo(el, { yPercent: -a }, { yPercent: a, ease: "none",
      scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.5 } });
  });

  // ---------- section handoffs: the next act rises inside a shape ----------
  // The section keeps its place in the flow (nothing of the previous act is covered). It paints the
  // previous act's ground (--prev-bg) and its own ground (--bg) in ::before, clipped to a disc whose
  // centre sits one viewport + k*vw below its top; the disc grows until it covers (big radius = gentle arc).
  const prevAct = sec => { let p = sec.previousElementSibling; while (p && !p.matches("section")) p = p.previousElementSibling; return p; };
  const groundOf = el => (el && (getComputedStyle(el).getPropertyValue("--bg").trim() || getComputedStyle(el).backgroundColor)) || "";
  // The disc starts touching the section's top edge (r = cy) and ends exactly covering its top corners,
  // so the dome is on screen for the whole entry. Smaller k = taller dome.
  document.querySelectorAll("[data-wow-handoff]").forEach(sec => {
    const cy = () => innerWidth * (desk ? 0.75 : 0.6);
    const place = () => { sec.style.setProperty("--hcy", cy() + "px"); sec.style.setProperty("--prev-bg", groundOf(prevAct(sec))); };
    place(); ScrollTrigger.addEventListener("refreshInit", place);
    gsap.fromTo(sec, { "--hr": () => cy() + "px" }, { "--hr": () => Math.hypot(innerWidth / 2, cy()) + 2 + "px", ease: "none", immediateRender: true,
      scrollTrigger: { trigger: sec, start: "top bottom", end: "top 12%", scrub: 0.5, invalidateOnRefresh: true, onEnter: place, onEnterBack: place,
        // once open, drop the clip so long pinned acts can never meet the disc edge
        onLeave: () => sec.classList.add("wow-open"), onEnterBack: () => sec.classList.remove("wow-open") } });
  });


  // ---------- chrome ----------
  const badge = document.querySelector("[data-wow-badge]");
  if (badge) {
    let rot = 0, speed = 12;
    gsap.ticker.add((t, dt) => { rot += speed * Math.min(dt, 100) / 1000; badge.style.transform = `rotate(${rot}deg)`; });
    const kick = v => { speed = Math.sign(v || 1) * (12 + 8 * Math.min(Math.abs(v), 40)); gsap.to({}, { duration: 0.6, onComplete: () => (speed = 12) }); };
    if (lenis) lenis.on("scroll", ({ velocity }) => kick(velocity));
    else { let last = scrollY; addEventListener("scroll", () => { kick((scrollY - last) / 4); last = scrollY; }, { passive: true }); }
  }
  const prog = document.querySelectorAll("[data-wow-progress]");
  if (prog.length) ScrollTrigger.create({ start: 0, end: "max", onUpdate: st => prog.forEach(p => p.style.setProperty("--p", st.progress.toFixed(4))) });

  // ---------- preloader: hold, then open a shape onto the hero ----------
  const release = () => held.forEach(f => f());
  if (loader) {
    lenis?.stop(); root.classList.add("wow-lock");
    // the loader is masked by a radial hole (--hole, see wow.css); growing the hole opens onto the hero
    let released = false;
    const go = () => { if (!released) { released = true; release(); } };
    const tl = gsap.timeline({ delay: 0.2, onComplete: () => { loader.remove(); root.classList.remove("wow-lock"); lenis?.start(); ScrollTrigger.refresh(); } });
    // budget ≤ 2.4s from load: in 0.6 + stagger 0.2 + hold 0.25 + hole 1.1 (+0.2 delay) ≈ 2.35s
    tl.from(loader.querySelectorAll("[data-wow-loader-in]"), { opacity: 0, y: 16, duration: 0.6, ease: EASE.out, stagger: 0.1 })
      .to({}, { duration: 0.25 })
      .to(loader.querySelectorAll("[data-wow-loader-in]"), { opacity: 0, duration: 0.3, ease: "power2.in" })
      .fromTo(loader, { "--hole": "0vmax" }, { "--hole": "120vmax", duration: 1.1, ease: EASE.inOut }, "<")
      .add(go, "-=0.7");
    // never trap the visitor: any input skips
    const skip = () => { tl.progress(1); go(); };
    ["wheel", "keydown", "touchstart", "pointerdown"].forEach(e => addEventListener(e, skip, { once: true, passive: true }));
  }

  addEventListener("load", () => ScrollTrigger.refresh());
})();

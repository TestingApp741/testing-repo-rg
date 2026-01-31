const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealEls = Array.from(document.querySelectorAll(".reveal"));
const lineEls = Array.from(document.querySelectorAll(".fill-line, .connector"));
const parallaxEls = Array.from(document.querySelectorAll("[data-parallax]"));

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const updateLines = () => {
  const viewport = window.innerHeight;
  lineEls.forEach((line) => {
    const rect = line.getBoundingClientRect();
    const progress = clamp((viewport - rect.top) / (viewport + rect.height), 0, 1);
    line.style.setProperty("--fill", progress.toFixed(3));
  });
};

const updateParallax = (scrollY) => {
  if (prefersReduced) {
    return;
  }

  document.documentElement.style.setProperty("--parallax-slow", `${scrollY * -0.08}px`);
  document.documentElement.style.setProperty("--parallax-fast", `${scrollY * -0.18}px`);
  document.documentElement.style.setProperty("--parallax-lines", `${scrollY * -0.05}px`);

  parallaxEls.forEach((el) => {
    const speed = Number.parseFloat(el.dataset.parallax || "0.1");
    el.style.transform = `translate3d(0, ${scrollY * speed * -1}px, 0)`;
  });
};

const onScroll = () => {
  const scrollY = window.scrollY || window.pageYOffset;
  updateParallax(scrollY);
  updateLines();
};

const initReveals = () => {
  if (prefersReduced) {
    revealEls.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealEls.forEach((el) => observer.observe(el));
};

let ticking = false;
const handleScroll = () => {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => {
    onScroll();
    ticking = false;
  });
};

initReveals();
updateParallax(window.scrollY || 0);
updateLines();

window.addEventListener("scroll", handleScroll, { passive: true });
window.addEventListener("resize", handleScroll);

const setupCarousel = () => {
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const track = carousel.querySelector(".carousel-track");
    const cards = Array.from(track.children);
    const prev = carousel.querySelector(".carousel-btn.prev");
    const next = carousel.querySelector(".carousel-btn.next");
    if (!track || cards.length === 0) return;

    let index = 0;
    let offset = 0;
    let cardWidth = 0;
    let gap = 0;
    let isDragging = false;
    let startX = 0;
    let startOffset = 0;
    let autoTimer = null;

    const updateMetrics = () => {
      const card = cards[0];
      const styles = window.getComputedStyle(track);
      gap = Number.parseFloat(styles.gap || "0");
      cardWidth = card.getBoundingClientRect().width + gap;
      offset = cardWidth * index;
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    const setIndex = (nextIndex) => {
      const max = cards.length - 1;
      index = Math.max(0, Math.min(nextIndex, max));
      offset = cardWidth * index;
      track.style.transition = "transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)";
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    const step = (direction) => setIndex(index + direction);

    const onPointerDown = (event) => {
      isDragging = true;
      startX = event.clientX;
      startOffset = offset;
      track.style.transition = "none";
      carousel.classList.add("is-dragging");
      stopAuto();
    };

    const onPointerMove = (event) => {
      if (!isDragging) return;
      const delta = startX - event.clientX;
      const max = cardWidth * (cards.length - 1);
      offset = Math.max(0, Math.min(startOffset + delta, max));
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      carousel.classList.remove("is-dragging");
      const nextIndex = Math.round(offset / cardWidth);
      setIndex(nextIndex);
      startAuto();
    };

    const startAuto = () => {
      if (prefersReduced) return;
      autoTimer = window.setInterval(() => {
        if (index === cards.length - 1) {
          setIndex(0);
        } else {
          step(1);
        }
      }, 4200);
    };

    const stopAuto = () => {
      if (autoTimer) {
        window.clearInterval(autoTimer);
        autoTimer = null;
      }
    };

    prev?.addEventListener("click", () => step(-1));
    next?.addEventListener("click", () => step(1));

    carousel.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    carousel.addEventListener("mouseenter", stopAuto);
    carousel.addEventListener("mouseleave", startAuto);
    carousel.addEventListener("focusin", stopAuto);
    carousel.addEventListener("focusout", startAuto);

    updateMetrics();
    window.addEventListener("resize", updateMetrics);
    startAuto();
  });
};

setupCarousel();

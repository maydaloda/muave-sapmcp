/** One-shot scroll reveal: adds `.is-visible` to `[data-reveal]` as it enters view. */
export function initReveal(): () => void {
  if (typeof window === "undefined") return () => {};
  const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        if (el.dataset.revealDelay) el.style.transitionDelay = `${el.dataset.revealDelay}ms`;
        el.classList.add("is-visible");
        observer.unobserve(el);
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
  );
  targets.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

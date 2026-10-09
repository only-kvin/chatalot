"use client";

import { useEffect } from "react";

// Reveals [data-reveal] elements once as they scroll into view (styles in
// globals.css). Rendered once per page. Content is only hidden after this
// runs, so without JavaScript everything is simply visible.
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    const targets = document.querySelectorAll("[data-reveal]:not([data-revealed])");
    // Anything already on screen is shown straight away, not faded in.
    const fold = window.innerHeight;
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top < fold) el.setAttribute("data-revealed", "");
      else io.observe(el);
    });
    root.setAttribute("data-reveal-ready", "");
    return () => {
      io.disconnect();
      root.removeAttribute("data-reveal-ready");
    };
  }, []);
  return null;
}

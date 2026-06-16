"use client";

import { useEffect } from "react";
import { initReveal } from "@/lib/reveal";

/** Activates scroll-reveal for any [data-reveal] elements on the page. */
export function RevealClient() {
  useEffect(() => initReveal(), []);
  return null;
}

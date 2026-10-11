"use client";

import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "lucide-react";

// The 45-second film. Nothing loads until the visitor scrolls near it: the
// poster appears then, and the video itself only when they press play
// (preload="none"). The box keeps its shape throughout, so nothing shifts.
// Landscape on wider screens, portrait on phones. The films have no sound.

const FILMS = {
  landscape: { src: "/video/ad-45-landscape.mp4", poster: "/video/ad-45-landscape-poster.jpg" },
  portrait: { src: "/video/ad-45-portrait.mp4", poster: "/video/ad-45-portrait-poster.jpg" },
};

export function Film({ title }: { title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setPortrait(mq.matches);
        setNear(true);
        io.disconnect();
      },
      { rootMargin: "400px 0px" },
    );
    if (boxRef.current) io.observe(boxRef.current);
    return () => io.disconnect();
  }, []);

  const film = portrait ? FILMS.portrait : FILMS.landscape;

  return (
    <div
      ref={boxRef}
      className="relative mx-auto aspect-[9/16] max-h-[78vh] w-full max-w-[420px] overflow-hidden rounded-3xl bg-[#0c1412] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_40px_100px_-40px_rgb(14_92_75/0.5)] sm:aspect-video sm:max-h-none sm:max-w-none"
    >
      {near && (
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-cover"
          src={film.src}
          poster={film.poster}
          preload="none"
          playsInline
          controls={playing}
          aria-label={title}
          onEnded={() => setPlaying(false)}
        />
      )}
      {!playing && (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
            void videoRef.current?.play();
          }}
          className="group absolute inset-0 flex items-center justify-center outline-none"
          aria-label={`Play: ${title}`}
        >
          <span className="flex size-20 items-center justify-center rounded-full bg-white/95 text-[#0e5c4b] shadow-[0_20px_40px_-12px_rgb(0_0_0/0.6)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-white/60 motion-snap">
            <PlayIcon className="ml-1 size-8 fill-current" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}

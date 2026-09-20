(() => {
  const body = document.body;
  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelectorAll(".nav-links a");

  if (toggle) {
    toggle.addEventListener("click", () => {
      const open = body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  links.forEach((link) => {
    link.addEventListener("click", () => {
      body.classList.remove("nav-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });
  });

  const features = document.querySelectorAll(".feature");
  if (features.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    features.forEach((el) => io.observe(el));
  } else {
    features.forEach((el) => el.classList.add("is-visible"));
  }

  const media = document.querySelector(".hero__media");
  const video = document.querySelector("[data-hero-video]");
  if (media && video instanceof HTMLVideoElement) {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const showFallback = () => {
      media.classList.remove("is-playing");
      media.classList.add("is-fallback");
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    if (reduced) {
      showFallback();
    } else {
      const tryPlay = () => {
        const play = video.play();
        if (play && typeof play.then === "function") {
          play
            .then(() => {
              media.classList.add("is-playing");
              media.classList.remove("is-fallback");
            })
            .catch(showFallback);
        } else {
          media.classList.add("is-playing");
        }
      };

      video.addEventListener("error", showFallback);
      video.addEventListener(
        "loadeddata",
        () => {
          if (video.readyState >= 2) tryPlay();
        },
        { once: true },
      );
      video.addEventListener(
        "canplay",
        () => {
          tryPlay();
        },
        { once: true },
      );

      // Kick off load; poster stays visible until is-playing.
      video.load();
      if (video.readyState >= 2) tryPlay();
    }
  }
})();

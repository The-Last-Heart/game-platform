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
})();

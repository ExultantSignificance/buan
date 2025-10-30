document.addEventListener("DOMContentLoaded", () => {
  const revealElements = document.querySelectorAll(".review, .about");

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  revealElements.forEach(el => observer.observe(el));

  // For elements already visible at load
  revealElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) el.classList.add("visible");
  });
});

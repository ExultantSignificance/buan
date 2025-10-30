document.addEventListener("DOMContentLoaded", () => {
  const reviews = document.querySelectorAll(".review");

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target); // trigger only once per review
      }
    });
  }, { threshold: 0.2 });

  reviews.forEach(review => {
    observer.observe(review);
  });
});

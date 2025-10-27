document.addEventListener("scroll", () => {
  const reviews = document.querySelectorAll(".review");
  reviews.forEach(r => {
    const rect = r.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      r.classList.add("visible");
    }
  });
});

document.querySelectorAll("form[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!confirm(form.dataset.confirm)) event.preventDefault();
  });
});

// Esc cancels inline editing.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector(".edit")) {
    const url = new URL(location.href);
    url.searchParams.delete("edit");
    location.href = url;
  }
});

// Fills the "last updated" date on legal pages.
const today = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
for (const el of document.querySelectorAll<HTMLElement>("[data-today]")) {
  el.textContent = today;
}

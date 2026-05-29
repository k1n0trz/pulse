// Minimal landing interactivity: dynamic year + app links resolved from env.

const appUrl = (import.meta.env.VITE_APP_URL as string | undefined) ?? "http://localhost:5173";

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-app-link]")) {
  link.href = appUrl;
}

// Smooth-scroll for same-page anchors.
for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]:not([data-app-link])')) {
  anchor.addEventListener("click", (e) => {
    const id = anchor.getAttribute("href")!.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

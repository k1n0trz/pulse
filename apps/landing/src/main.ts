// Minimal landing interactivity: dynamic year + app links resolved from env.

const appUrl = (import.meta.env.VITE_APP_URL as string | undefined) ?? "http://localhost:5173";

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-app-link]")) {
  link.href = appUrl;
}

// Mobile nav: hamburger toggles the dropdown menu.
const nav = document.querySelector<HTMLElement>("header.nav");
const navToggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
const closeMenu = () => {
  nav?.classList.remove("menu-open");
  navToggle?.setAttribute("aria-expanded", "false");
};
navToggle?.addEventListener("click", () => {
  const open = nav?.classList.toggle("menu-open") ?? false;
  navToggle.setAttribute("aria-expanded", String(open));
});

// Smooth-scroll for same-page anchors (and close the mobile menu after a jump).
for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]:not([data-app-link])')) {
  anchor.addEventListener("click", (e) => {
    const id = anchor.getAttribute("href")!.slice(1);
    if (!id) {
      closeMenu();
      return;
    }
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    closeMenu();
  });
}

// Close the mobile menu when an app link (CTA) is tapped.
for (const link of document.querySelectorAll<HTMLAnchorElement>(".nav-links [data-app-link]")) {
  link.addEventListener("click", closeMenu);
}

const preference = window.matchMedia("(prefers-color-scheme: dark)");

function syncTheme(): void {
  document.documentElement.classList.toggle("dark", preference.matches);
}

syncTheme();
preference.addEventListener("change", syncTheme);

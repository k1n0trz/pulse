// Lightweight i18n (Fase 8) — no external dependency. A locale context + a t()
// lookup over flat dictionaries, persisted to localStorage. ES is the source of
// truth and the fallback for any missing key.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const LOCALES = ["es", "en", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  de: "Deutsch"
};

type Dict = Record<string, string>;

const es: Dict = {
  "nav.inicio": "Inicio",
  "nav.campanas": "Campañas",
  "nav.autopilot": "Autopilot",
  "nav.chat": "Chat Pulse",
  "nav.auditoria": "Auditoría",
  "nav.reportes": "Reportes",
  "nav.perfil": "Perfil",
  "topbar.subtitle": "Rendimiento y ejecución activa de campañas Meta Ads.",
  "topbar.summary": "Resumen general",
  "topbar.greeting": "Hola",
  "topbar.last7": "Últimos 7 días",
  "topbar.audit": "Auditar cuenta",
  "topbar.connect": "Conectar cuenta publicitaria",
  "topbar.account": "Cuenta",
  "metrics.spend": "Inversión total",
  "metrics.results": "Resultados",
  "metrics.cpa": "CPA promedio",
  "metrics.roas": "ROAS",
  "metrics.ctrcpm": "CTR / CPM",
  "metrics.activeCampaigns": "Campañas activas",
  "metrics.accountAvg": "promedio de cuentas",
  "mode.title": "Modo actual",
  "mode.read": "Lectura",
  "mode.assisted": "Asistido",
  "mode.auto": "Auto",
  "mode.read_desc": "Solo analiza.",
  "mode.assisted_desc": "Requiere aprobación para ejecutar.",
  "mode.auto_desc": "Ejecuta dentro de límites.",
  "mode.kill": "Kill Switch",
  "mode.blockCritical": "Bloquear críticas",
  "profile.title": "Perfil",
  "profile.subtitle": "Tu cuenta y preferencias.",
  "profile.account_section": "Cuenta",
  "profile.email": "Email",
  "profile.role": "Rol",
  "profile.plan": "Plan",
  "profile.superadmin": "Superadmin · acceso permanente",
  "profile.language": "Idioma",
  "profile.language_hint": "Cambia el idioma de la aplicación.",
  "common.connectedAccount": "Cuenta publicitaria",
  "common.noConnection": "Sin conexión activa",
  "common.connectMeta": "Conecta Meta para datos reales"
};

const en: Dict = {
  "nav.inicio": "Home",
  "nav.campanas": "Campaigns",
  "nav.autopilot": "Autopilot",
  "nav.chat": "Pulse Chat",
  "nav.auditoria": "Audit",
  "nav.reportes": "Reports",
  "nav.perfil": "Profile",
  "topbar.subtitle": "Performance and live execution of Meta Ads campaigns.",
  "topbar.summary": "Overview",
  "topbar.greeting": "Hi",
  "topbar.last7": "Last 7 days",
  "topbar.audit": "Audit account",
  "topbar.connect": "Connect ad account",
  "topbar.account": "Account",
  "metrics.spend": "Total spend",
  "metrics.results": "Results",
  "metrics.cpa": "Avg. CPA",
  "metrics.roas": "ROAS",
  "metrics.ctrcpm": "CTR / CPM",
  "metrics.activeCampaigns": "Active campaigns",
  "metrics.accountAvg": "account average",
  "mode.title": "Current mode",
  "mode.read": "Read",
  "mode.assisted": "Assisted",
  "mode.auto": "Auto",
  "mode.read_desc": "Analyze only.",
  "mode.assisted_desc": "Requires approval to execute.",
  "mode.auto_desc": "Executes within limits.",
  "mode.kill": "Kill Switch",
  "mode.blockCritical": "Block critical",
  "profile.title": "Profile",
  "profile.subtitle": "Your account and preferences.",
  "profile.account_section": "Account",
  "profile.email": "Email",
  "profile.role": "Role",
  "profile.plan": "Plan",
  "profile.superadmin": "Superadmin · permanent access",
  "profile.language": "Language",
  "profile.language_hint": "Change the application language.",
  "common.connectedAccount": "Ad account",
  "common.noConnection": "No active connection",
  "common.connectMeta": "Connect Meta for real data"
};

const fr: Dict = {
  "nav.inicio": "Accueil",
  "nav.campanas": "Campagnes",
  "nav.autopilot": "Autopilote",
  "nav.chat": "Chat Pulse",
  "nav.auditoria": "Audit",
  "nav.reportes": "Rapports",
  "nav.perfil": "Profil",
  "topbar.subtitle": "Performance et exécution en direct des campagnes Meta Ads.",
  "topbar.summary": "Vue d'ensemble",
  "topbar.greeting": "Bonjour",
  "topbar.last7": "7 derniers jours",
  "topbar.audit": "Auditer le compte",
  "topbar.connect": "Connecter un compte publicitaire",
  "topbar.account": "Compte",
  "metrics.spend": "Dépense totale",
  "metrics.results": "Résultats",
  "metrics.cpa": "CPA moyen",
  "metrics.roas": "ROAS",
  "metrics.ctrcpm": "CTR / CPM",
  "metrics.activeCampaigns": "Campagnes actives",
  "metrics.accountAvg": "moyenne du compte",
  "mode.title": "Mode actuel",
  "mode.read": "Lecture",
  "mode.assisted": "Assisté",
  "mode.auto": "Auto",
  "mode.read_desc": "Analyse uniquement.",
  "mode.assisted_desc": "Nécessite une approbation pour exécuter.",
  "mode.auto_desc": "Exécute dans les limites.",
  "mode.kill": "Kill Switch",
  "mode.blockCritical": "Bloquer les critiques",
  "profile.title": "Profil",
  "profile.subtitle": "Votre compte et vos préférences.",
  "profile.account_section": "Compte",
  "profile.email": "Email",
  "profile.role": "Rôle",
  "profile.plan": "Forfait",
  "profile.superadmin": "Superadmin · accès permanent",
  "profile.language": "Langue",
  "profile.language_hint": "Changez la langue de l'application.",
  "common.connectedAccount": "Compte publicitaire",
  "common.noConnection": "Aucune connexion active",
  "common.connectMeta": "Connectez Meta pour des données réelles"
};

const de: Dict = {
  "nav.inicio": "Start",
  "nav.campanas": "Kampagnen",
  "nav.autopilot": "Autopilot",
  "nav.chat": "Pulse-Chat",
  "nav.auditoria": "Audit",
  "nav.reportes": "Berichte",
  "nav.perfil": "Profil",
  "topbar.subtitle": "Leistung und Live-Ausführung von Meta-Ads-Kampagnen.",
  "topbar.summary": "Übersicht",
  "topbar.greeting": "Hallo",
  "topbar.last7": "Letzte 7 Tage",
  "topbar.audit": "Konto prüfen",
  "topbar.connect": "Werbekonto verbinden",
  "topbar.account": "Konto",
  "metrics.spend": "Gesamtausgaben",
  "metrics.results": "Ergebnisse",
  "metrics.cpa": "Ø CPA",
  "metrics.roas": "ROAS",
  "metrics.ctrcpm": "CTR / CPM",
  "metrics.activeCampaigns": "Aktive Kampagnen",
  "metrics.accountAvg": "Kontodurchschnitt",
  "mode.title": "Aktueller Modus",
  "mode.read": "Lesen",
  "mode.assisted": "Assistiert",
  "mode.auto": "Auto",
  "mode.read_desc": "Nur analysieren.",
  "mode.assisted_desc": "Erfordert Freigabe zur Ausführung.",
  "mode.auto_desc": "Führt innerhalb der Limits aus.",
  "mode.kill": "Kill Switch",
  "mode.blockCritical": "Kritische blockieren",
  "profile.title": "Profil",
  "profile.subtitle": "Ihr Konto und Ihre Einstellungen.",
  "profile.account_section": "Konto",
  "profile.email": "E-Mail",
  "profile.role": "Rolle",
  "profile.plan": "Tarif",
  "profile.superadmin": "Superadmin · dauerhafter Zugriff",
  "profile.language": "Sprache",
  "profile.language_hint": "Ändern Sie die Sprache der Anwendung.",
  "common.connectedAccount": "Werbekonto",
  "common.noConnection": "Keine aktive Verbindung",
  "common.connectMeta": "Meta verbinden für echte Daten"
};

const DICTS: Record<Locale, Dict> = { es, en, fr, de };

const STORAGE_KEY = "pulse.locale";

function detectInitial(): Locale {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
    const nav = window.navigator.language.slice(0, 2);
    if ((LOCALES as readonly string[]).includes(nav)) return nav as Locale;
  }
  return "es";
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitial);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: string) => DICTS[locale][key] ?? DICTS.es[key] ?? key, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within a LocaleProvider");
  return ctx;
}

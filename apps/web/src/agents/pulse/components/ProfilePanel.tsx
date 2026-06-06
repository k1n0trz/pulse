import { useEffect, useState } from "react";
import { Globe, ShieldCheck, User } from "lucide-react";
import { api } from "../../../lib/api";
import { LOCALES, LOCALE_LABELS, useI18n, type Locale } from "../../../i18n";

interface Me {
  email: string;
  role: string;
  plan: string;
  superadmin: boolean;
}

export function ProfilePanel() {
  const { t, locale, setLocale } = useI18n();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    Promise.all([api.me.get(), api.billing.status().catch(() => null)])
      .then(([meRes, billing]) => {
        setMe({
          email: meRes.user.email,
          role: (meRes as { role?: string }).role ?? "—",
          plan: billing?.plan ?? "—",
          superadmin: Boolean(meRes.user.isSuperadmin || billing?.isSuperadmin)
        });
      })
      .catch(() => setMe(null));
  }, []);

  return (
    <section className="single-view profile-panel">
      <div className="section-header">
        <div>
          <h2>{t("profile.title")}</h2>
          <p>{t("profile.subtitle")}</p>
        </div>
      </div>

      <div className="profile-grid">
        <section className="panel">
          <div className="panel-head"><h2><User size={18} /> {t("profile.account_section")}</h2></div>
          <div className="profile-rows">
            <div className="profile-row"><span>{t("profile.email")}</span><strong>{me?.email ?? "—"}</strong></div>
            <div className="profile-row"><span>{t("profile.role")}</span><strong>{me?.role ?? "—"}</strong></div>
            <div className="profile-row"><span>{t("profile.plan")}</span><strong>{me?.plan ?? "—"}</strong></div>
            {me?.superadmin && (
              <div className="profile-superadmin"><ShieldCheck size={15} /> {t("profile.superadmin")}</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2><Globe size={18} /> {t("profile.language")}</h2></div>
          <p className="muted">{t("profile.language_hint")}</p>
          <div className="lang-options">
            {LOCALES.map((l: Locale) => (
              <button
                key={l}
                className={`lang-btn ${locale === l ? "active" : ""}`}
                onClick={() => setLocale(l)}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

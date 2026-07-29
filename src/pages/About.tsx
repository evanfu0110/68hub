import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

export function About() {
  const { t } = useTranslation();
  const [version, setVersion] = useState('2.0.0');

  useEffect(() => {
    api.getAppVersion().then(setVersion).catch(() => {});
  }, []);

  const openLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-lg font-bold">{t('about.title')}</h1>
        <p className="text-xs text-base-content/40 mt-1">{t('about.version', { version })}</p>
      </header>

      <section className="border border-base-200 rounded-xl p-4 space-y-3">
        <p className="text-sm text-base-content/70 leading-relaxed">{t('about.desc1')}</p>
        <p className="text-sm text-base-content/70 leading-relaxed">{t('about.localFirst')}</p>
      </section>

      <section className="border border-base-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-base-content/70">{t('about.techStack')}</h2>
        <div className="flex flex-wrap gap-2">
          {['Tauri 2', 'Rust', 'React', 'TypeScript', 'SQLite', 'Recharts'].map((item) => (
            <span key={item} className="text-xs px-2 py-1 rounded-md bg-base-200 text-base-content/60 font-medium">{item}</span>
          ))}
        </div>
      </section>

      <button className="btn btn-primary w-full" onClick={() => openLink('https://github.com/evanfu0110/68hub')}>
        {t('about.download')}
      </button>
    </div>
  );
}

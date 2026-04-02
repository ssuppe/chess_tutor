import { SupportedLanguage, translations, Translations } from './translations';

export function useTranslation(language: SupportedLanguage): Translations {
    return translations[language] || translations.en;
}

export function getTranslation(language: SupportedLanguage, key: string): string {
    const t = translations[language] || translations.en;
    const keys = key.split('.');
    let value: unknown = t;

    for (const k of keys) {
        if (typeof value !== 'object' || value === null) {
            return key;
        }

        value = (value as Record<string, unknown>)[k];
    }

    return typeof value === 'string' ? value : key;
}

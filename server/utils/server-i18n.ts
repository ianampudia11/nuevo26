
import { storage } from '../storage';

interface TranslationCache {
  [languageCode: string]: Record<string, string>;
}

class ServerI18n {
  private cache: TranslationCache = {};

  constructor() {
  }

  /**
   * Load translations from database for a specific language
   */
  private async loadTranslations(languageCode: string): Promise<Record<string, string>> {
    try {

      const translationsArray = await storage.getTranslationsForLanguageAsArray(languageCode);

      const translations: Record<string, string> = {};
      if (translationsArray && translationsArray.length > 0) {
        for (const item of translationsArray) {
          translations[item.key] = item.value;
        }
      } else {
        console.warn(`No translations found in database for ${languageCode}`);
      }

      return translations;
    } catch (error) {
      console.error(`Error loading translations for ${languageCode}:`, error);

      if (languageCode !== 'en') {
        return this.loadTranslations('en');
      }
      return {};
    }
  }

  /**
   * Get translations for a language (with caching)
   */
  private async getTranslations(languageCode: string): Promise<Record<string, string>> {
    if (!this.cache[languageCode]) {
      this.cache[languageCode] = await this.loadTranslations(languageCode);
    }
    return this.cache[languageCode];
  }

  /**
   * Translate a key with optional variables
   */
  async t(
    key: string,
    language: string = 'en',
    fallback?: string,
    variables?: Record<string, any>
  ): Promise<string> {
    const translations = await this.getTranslations(language);
    let translation = translations[key] || fallback || key;


    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        const placeholder = `{{${varKey}}}`;
        translation = translation.replace(new RegExp(placeholder, 'g'), String(varValue));
      });
    }

    return translation;
  }

  /**
   * Synchronous version of t() - uses cached translations
   * Note: Call ensureLanguageLoaded() first to populate cache
   */
  tSync(
    key: string,
    language: string = 'en',
    fallback?: string,
    variables?: Record<string, any>
  ): string {
    const translations = this.cache[language] || this.cache['en'] || {};
    let translation = translations[key] || fallback || key;


    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        const placeholder = `{{${varKey}}}`;
        translation = translation.replace(new RegExp(placeholder, 'g'), String(varValue));
      });
    }

    return translation;
  }

  /**
   * Ensure translations for a language are loaded (for sync usage)
   */
  async ensureLanguageLoaded(languageCode: string): Promise<void> {
    if (!this.cache[languageCode]) {
      this.cache[languageCode] = await this.loadTranslations(languageCode);
    }
  }

  /**
   * Clear cache (useful for development/testing)
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get language name from code
   */
  getLanguageName(languageCode: string): string {
    const languageNames: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      ar: 'Arabic',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      hi: 'Hindi',
      tr: 'Turkish',
      nl: 'Dutch',
      sv: 'Swedish',
      da: 'Danish',
      no: 'Norwegian',
      fi: 'Finnish',
      pl: 'Polish',
      cs: 'Czech',
      hu: 'Hungarian',
      ro: 'Romanian',
      bg: 'Bulgarian',
      hr: 'Croatian',
      sk: 'Slovak',
      sl: 'Slovenian',
      et: 'Estonian',
      lv: 'Latvian',
      lt: 'Lithuanian',
      mt: 'Maltese',
      ga: 'Irish',
      cy: 'Welsh'
    };

    return languageNames[languageCode] || languageCode;
  }
}


const serverI18n = new ServerI18n();
export default serverI18n;


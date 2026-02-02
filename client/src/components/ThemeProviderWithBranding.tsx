import { useState, useEffect, ReactNode } from "react";
import { ThemeProvider } from "next-themes";

interface ThemeProviderWithBrandingProps {
  children: ReactNode;
}

/**
 * ThemeProvider wrapper that fetches branding settings to determine the default theme
 * before rendering. This prevents theme flashing on initial load.
 */
export function ThemeProviderWithBranding({ children }: ThemeProviderWithBrandingProps) {
  const [defaultTheme, setDefaultTheme] = useState<'dark' | 'light'>('dark');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBrandingTheme = async () => {
      try {

        let res = await fetch("/public/branding", {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });


        if (!res.ok) {
          try {
            const { apiRequest } = await import("@/lib/queryClient");
            res = await apiRequest("GET", "/api/branding");
          } catch (error) {

            setIsLoading(false);
            return;
          }
        }

        if (res.ok) {
          const settings = await res.json();
          const brandingSetting = settings.find((s: any) => s.key === 'branding');
          
          if (brandingSetting) {
            let brandingValue = brandingSetting.value;
            if (typeof brandingValue === 'string') {
              try {
                brandingValue = JSON.parse(brandingValue);
              } catch (e) {

              }
            }


            if (brandingValue?.defaultTheme === 'dark' || brandingValue?.defaultTheme === 'light') {
              setDefaultTheme(brandingValue.defaultTheme);

              if (brandingValue.defaultTheme === 'dark') {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
              } else {
                document.documentElement.classList.add('light');
                document.documentElement.classList.remove('dark');
              }
            }
          }
        }
      } catch (error) {

        console.error('Error fetching branding theme:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrandingTheme();
  }, []);


  useEffect(() => {
    if (isLoading) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [isLoading]);



  if (isLoading) {
    return null;
  }

  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme={defaultTheme} 
      storageKey="theme" 
      enableSystem={false}
    >
      {children}
    </ThemeProvider>
  );
}

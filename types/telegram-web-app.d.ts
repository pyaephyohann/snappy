interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    auth_date?: number;
    hash?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  openLink: (url: string) => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  MainButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
  };
}

interface Telegram {
  WebApp: TelegramWebApp;
}

interface Window {
  Telegram?: Telegram;
}

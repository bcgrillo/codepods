export interface AppConfig {
  apiUrl: string;
  wsUrl: string;
}

export const defaultConfig: AppConfig = {
  apiUrl: '/api',
  wsUrl: '',
};

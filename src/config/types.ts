export interface ProviderProfile {
  name: string;
  providerId?: string;
  kind?: 'gateway' | 'provider' | 'custom';
  baseURL: string;
  apiKey?: string;
  model: string;
  description?: string;
}

export interface ZeroConfig {
  activeProvider?: string;
  providers: ProviderProfile[];
}

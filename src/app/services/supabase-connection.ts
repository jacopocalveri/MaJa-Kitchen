import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../domain/database.types';

interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

declare global {
  interface Window {
    MAJA_CONFIG?: RuntimeConfig;
  }
}

@Injectable({ providedIn: 'root' })
export class SupabaseConnection {
  readonly isConfigured: boolean;
  private clientPromise: Promise<SupabaseClient<Database>> | null = null;

  constructor() {
    const config = typeof window === 'undefined' ? undefined : window.MAJA_CONFIG;
    this.isConfigured = Boolean(config?.supabaseUrl && config.supabaseAnonKey);
  }

  async getClient(): Promise<SupabaseClient<Database> | null> {
    if (!this.isConfigured) {
      return null;
    }
    this.clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
      const config = window.MAJA_CONFIG;
      if (!config?.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('La configurazione Supabase non è completa.');
      }
      return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      });
    });
    return this.clientPromise;
  }
}

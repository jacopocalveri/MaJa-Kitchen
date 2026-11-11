import { Injectable, signal } from '@angular/core';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '../domain/database.types';
import { SupabaseConnection } from './supabase-connection';

export type AuthStatus =
  'loading' | 'demo' | 'unauthenticated' | 'needs-household' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly status = signal<AuthStatus>('loading');
  readonly user = signal<User | null>(null);
  readonly householdId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  private client: SupabaseClient<Database> | null = null;
  private initialization: Promise<void> | null = null;
  private unsubscribeAuth: (() => void) | null = null;

  constructor(private readonly connection: SupabaseConnection) {}

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.initializeOnce().then(() => {
        if (this.status() === 'error') {
          this.initialization = null;
        }
      });
    }
    return this.initialization;
  }

  async signIn(email: string, password: string): Promise<void> {
    this.clearMessages();
    try {
      const client = await this.getClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        this.error.set(error.message);
        return;
      }
      if (data.user) {
        this.user.set(data.user);
      }
    } catch (error) {
      this.error.set(errorMessage(error, 'Accesso non riuscito.'));
    }
  }

  async signUp(email: string, password: string): Promise<void> {
    this.clearMessages();
    try {
      const client = await this.getClient();
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) {
        this.error.set(error.message);
        return;
      }
      if (data.session && data.user) {
        this.user.set(data.user);
        return;
      }
      this.status.set('unauthenticated');
      this.message.set('Registrazione avviata. Controlla la tua email per confermare l’account.');
    } catch (error) {
      this.error.set(errorMessage(error, 'Registrazione non riuscita.'));
    }
  }

  async signOut(): Promise<void> {
    this.clearMessages();
    try {
      const client = await this.getClient();
      const { error } = await client.auth.signOut();
      if (error) {
        this.error.set(error.message);
        return;
      }
      this.user.set(null);
      this.householdId.set(null);
      this.status.set('unauthenticated');
    } catch (error) {
      this.error.set(errorMessage(error, 'Impossibile uscire dall’account.'));
    }
  }

  async createHousehold(name: string): Promise<void> {
    this.clearMessages();
    const user = this.user();
    if (!user) {
      this.error.set('Accedi prima di creare la casa.');
      return;
    }
    try {
      const client = await this.getClient();
      const { data, error } = await client.rpc('create_household_with_seed', {
        p_name: name.trim() || 'Casa MaJa',
      });
      if (error) {
        this.error.set(error.message);
        return;
      }
      if (!data) {
        this.error.set('Supabase non ha restituito l’ID della casa creata.');
        return;
      }
      this.householdId.set(data);
      this.status.set('ready');
    } catch (error) {
      this.error.set(errorMessage(error, 'Impossibile creare la casa.'));
    }
  }

  clearMessages(): void {
    this.error.set(null);
    this.message.set(null);
  }

  private async initializeOnce(): Promise<void> {
    if (!this.connection.isConfigured) {
      this.status.set('demo');
      return;
    }
    this.status.set('loading');
    try {
      this.unsubscribeAuth?.();
      this.unsubscribeAuth = null;
      this.client = await this.connection.getClient();
      if (!this.client) {
        this.status.set('demo');
        return;
      }
      const { data, error } = await this.client.auth.getSession();
      if (error) {
        throw error;
      }
      if (data.session?.user) {
        this.user.set(data.session.user);
        await this.refreshHousehold(data.session.user);
      } else {
        this.status.set('unauthenticated');
      }

      const { data: authState } = this.client.auth.onAuthStateChange((event, session) => {
        if (session?.user && this.user()?.id === session.user.id) {
          if (event === 'USER_UPDATED') {
            this.user.set(session.user);
          }
          if (this.status() === 'ready' || this.status() === 'needs-household') {
            return;
          }
        }
        this.user.set(session?.user ?? null);
        if (!session?.user) {
          this.householdId.set(null);
          this.status.set('unauthenticated');
          return;
        }
        queueMicrotask(() => void this.refreshHousehold(session.user));
      });
      this.unsubscribeAuth = () => authState.subscription.unsubscribe();
    } catch (error) {
      this.status.set('error');
      this.error.set(errorMessage(error, 'Impossibile inizializzare la sessione Supabase.'));
    }
  }

  private async refreshHousehold(user: User): Promise<void> {
    try {
      const client = await this.getClient();
      const { data, error } = await client
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      this.householdId.set(data?.household_id ?? null);
      this.status.set(data ? 'ready' : 'needs-household');
    } catch (error) {
      this.status.set('error');
      this.error.set(errorMessage(error, 'Impossibile caricare la casa associata.'));
    }
  }

  private async getClient(): Promise<SupabaseClient<Database>> {
    const client = this.client ?? (await this.connection.getClient());
    if (!client) {
      throw new Error('Configura Supabase prima di usare l’autenticazione.');
    }
    this.client = client;
    return client;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

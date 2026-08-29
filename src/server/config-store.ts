import { supabase } from './supabase-client.js';

export interface AppConfig {
  sampleTestSuite: string;
  sampleTargetUrl: string;
  sampleSteps: Array<{
    action: string;
    targetLabel: string;
    value: string;
    description: string;
  }>;
}

const DEFAULT_CONFIG: AppConfig = {
  sampleTestSuite: '',
  sampleTargetUrl: '',
  sampleSteps: []
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !data) {
      return DEFAULT_CONFIG;
    }

    return {
      sampleTestSuite: data.sample_test_suite || '',
      sampleTargetUrl: data.sample_target_url || '',
      sampleSteps: Array.isArray(data.sample_steps) ? data.sample_steps : []
    };
  } catch (err: unknown) {
    console.error('Failed to load config from Supabase:', (err as Error).message || err);
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(newConfig: AppConfig): Promise<void> {
  try {
    const { error } = await supabase
      .from('app_config')
      .upsert({
        id: 1,
        sample_test_suite: newConfig.sampleTestSuite,
        sample_target_url: newConfig.sampleTargetUrl,
        sample_steps: newConfig.sampleSteps,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) {
      console.error('Failed to save config:', error);
      throw new Error('Could not save configuration');
    }
  } catch (err: unknown) {
    console.error('Failed to save config:', (err as Error).message || err);
    throw new Error('Could not save configuration');
  }
}

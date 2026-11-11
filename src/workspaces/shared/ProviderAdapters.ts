export type IntegrationFamily = 'security' | 'monitoring' | 'infrastructure' | 'ai'
export type SecurityProviderId = 'crowdsec' | 'fail2ban' | 'wazuh' | 'openvas' | 'cloudflare'
export type MonitoringProviderId = 'prometheus' | 'grafana' | 'loki'
export type InfrastructureProviderId = 'proxmox' | 'docker' | 'coolify'
export type AIProviderId = 'gemini' | 'openai' | 'local-ai'
export type ProviderId = SecurityProviderId | MonitoringProviderId | InfrastructureProviderId | AIProviderId

export interface ProviderAdapter<TSnapshot> {
  readonly id: ProviderId
  readonly family: IntegrationFamily
  read(signal: AbortSignal): Promise<TSnapshot>
}

export interface SecuritySnapshot { events: readonly { id: string; severity: string; observedAt: string }[] }
export interface MonitoringSnapshot { observations: readonly { name: string; value: number; observedAt: string }[] }
export interface InfrastructureSnapshot { entities: readonly { id: string; kind: string; status: string }[] }
export interface AIResponse { content: string; generatedAt: string }

export type SecurityProvider = ProviderAdapter<SecuritySnapshot> & { readonly family: 'security'; readonly id: SecurityProviderId }
export type MonitoringProvider = ProviderAdapter<MonitoringSnapshot> & { readonly family: 'monitoring'; readonly id: MonitoringProviderId }
export type InfrastructureProvider = ProviderAdapter<InfrastructureSnapshot> & { readonly family: 'infrastructure'; readonly id: InfrastructureProviderId }
export interface AIProvider {
  readonly id: AIProviderId
  readonly family: 'ai'
  generate(prompt: string, signal: AbortSignal): Promise<AIResponse>
}

export interface CrowdSecProvider extends SecurityProvider { readonly id: 'crowdsec' }
export interface Fail2BanProvider extends SecurityProvider { readonly id: 'fail2ban' }
export interface WazuhProvider extends SecurityProvider { readonly id: 'wazuh' }
export interface OpenVASProvider extends SecurityProvider { readonly id: 'openvas' }
export interface CloudflareProvider extends SecurityProvider { readonly id: 'cloudflare' }
export interface PrometheusProvider extends MonitoringProvider { readonly id: 'prometheus' }
export interface GrafanaProvider extends MonitoringProvider { readonly id: 'grafana' }
export interface LokiProvider extends MonitoringProvider { readonly id: 'loki' }
export interface ProxmoxProvider extends InfrastructureProvider { readonly id: 'proxmox' }
export interface DockerProvider extends InfrastructureProvider { readonly id: 'docker' }
export interface CoolifyProvider extends InfrastructureProvider { readonly id: 'coolify' }
export interface GeminiProvider extends AIProvider { readonly id: 'gemini' }
export interface OpenAIProvider extends AIProvider { readonly id: 'openai' }
export interface LocalProvider extends AIProvider { readonly id: 'local-ai' }

import fs from 'fs';
import { net } from 'electron';
import {
  Agent,
  EnvHttpProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from 'undici';
import { loadServiceConfig, type NetworkSettings } from './config';

let activeKey = '';
let activeDispatcher: Dispatcher | null = null;

function environmentValue(lower: string, upper: string): string {
  return process.env[lower] || process.env[upper] || '';
}

function caFingerprint(caCertPath: string): string {
  if (!caCertPath) return '';
  try {
    const stat = fs.statSync(caCertPath);
    return `${caCertPath}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return `${caCertPath}:missing`;
  }
}

function dispatcherKey(settings: NetworkSettings): string {
  const envHttp = environmentValue('http_proxy', 'HTTP_PROXY');
  const envHttps = environmentValue('https_proxy', 'HTTPS_PROXY');
  const envNoProxy = environmentValue('no_proxy', 'NO_PROXY');
  return JSON.stringify({
    ...settings,
    envHttp: settings.proxy_mode === 'environment' ? envHttp : '',
    envHttps: settings.proxy_mode === 'environment' ? envHttps : '',
    envNoProxy: settings.proxy_mode === 'environment' ? envNoProxy : '',
    ca: caFingerprint(settings.ca_cert_path),
  });
}

function readCaCertificate(path: string): string | undefined {
  if (!path) return undefined;
  try {
    return fs.readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(`无法读取企业 CA 证书: ${String(error instanceof Error ? error.message : error)}`);
  }
}

function createDispatcher(settings: NetworkSettings): Dispatcher | null {
  const ca = readCaCertificate(settings.ca_cert_path);
  const tls = ca ? { ca } : undefined;

  if (settings.proxy_mode === 'direct') {
    return tls ? new Agent({ connect: tls }) : null;
  }

  const envHttp = environmentValue('http_proxy', 'HTTP_PROXY');
  const envHttps = environmentValue('https_proxy', 'HTTPS_PROXY');
  const envNoProxy = environmentValue('no_proxy', 'NO_PROXY');
  const httpProxy = settings.proxy_mode === 'manual' ? settings.proxy_url : envHttp;
  const httpsProxy = settings.proxy_mode === 'manual' ? settings.proxy_url : envHttps;
  const noProxy =
    settings.proxy_mode === 'manual'
      ? settings.no_proxy
      : [envNoProxy, settings.no_proxy].filter(Boolean).join(',');

  if (!httpProxy && !httpsProxy && !tls) return null;

  return new EnvHttpProxyAgent({
    httpProxy: httpProxy || undefined,
    httpsProxy: httpsProxy || undefined,
    noProxy,
    connect: tls,
    requestTls: tls,
    proxyTls: tls,
  } as EnvHttpProxyAgent.Options & {
    requestTls?: { ca: string };
    proxyTls?: { ca: string };
  });
}

function getDispatcher(settings: NetworkSettings): Dispatcher | null {
  const key = dispatcherKey(settings);
  if (key === activeKey) return activeDispatcher;

  const previous = activeDispatcher;
  activeDispatcher = createDispatcher(settings);
  activeKey = key;
  if (previous) void previous.close().catch(() => undefined);
  return activeDispatcher;
}

export function resetOutboundHttpClient(): void {
  const previous = activeDispatcher;
  activeDispatcher = null;
  activeKey = '';
  if (previous) void previous.close().catch(() => undefined);
}

export async function outboundFetch(url: string, init: RequestInit = {}) {
  const settings = loadServiceConfig().network;
  if (settings.proxy_mode === 'system') {
    return net.fetch(url, init);
  }

  const dispatcher = getDispatcher(settings);
  return undiciFetch(url, {
    ...init,
    dispatcher: dispatcher || undefined,
  } as Parameters<typeof undiciFetch>[1]);
}

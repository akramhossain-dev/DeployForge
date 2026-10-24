import { parseDocument, stringify } from 'yaml';
import crypto from 'node:crypto';
import { EffectiveResourcePolicy, splitComposePolicy } from '../resource-policy';

export type ComposeIngressCandidate = {
    service: string;
    ports: number[];
};

export type ComposeSelection = {
    composeService?: string | null;
    composePort?: number | null;
};

export class ComposePolicyError extends Error {
    readonly errorCode: string;
    readonly statusCode: number;
    readonly candidates: ComposeIngressCandidate[];

    constructor(message: string, errorCode: string, candidates: ComposeIngressCandidate[] = [], statusCode = 422) {
        super(message);
        this.name = 'ComposePolicyError';
        this.errorCode = errorCode;
        this.statusCode = statusCode;
        this.candidates = candidates;
    }
}

export type SanitizedCompose = {
    yaml: string;
    candidateYaml: string;
    dependencyYaml: string | null;
    dependencyFingerprint: string;
    hasDependencies: boolean;
    service: string;
    port: number;
    candidates: ComposeIngressCandidate[];
};

const serviceNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const volumeNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const infrastructurePattern = /(postgres|mysql|mariadb|mongo|redis|memcache|elastic|rabbit|broker|queue|database|(^|[-_.])db($|[-_.]))/i;
const forbiddenServiceKeys = [
    'privileged',
    'devices',
    'device_cgroup_rules',
    'cap_add',
    'network_mode',
    'pid',
    'ipc',
    'uts',
    'userns_mode',
    'cgroup',
    'cgroup_parent',
    'volumes_from',
    'sysctls',
    'ulimits',
    'runtime',
    'gpus',
    'extends',
    'use_api_socket',
    'credential_spec',
    'isolation',
    'develop',
] as const;

function record(value: unknown): Record<string, any> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function safeRelativePath(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.trim()) throw new ComposePolicyError(`${label} must be a relative path`, 'COMPOSE_UNSAFE_PATH');
    const normalized = value.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.startsWith('~') || normalized.split('/').includes('..')) {
        throw new ComposePolicyError(`${label} cannot escape the deployment workspace`, 'COMPOSE_UNSAFE_PATH');
    }
}

function parsePort(value: unknown): number | null {
    const raw = String(value ?? '').split('/')[0];
    if (!/^\d{1,5}$/.test(raw)) return null;
    const port = Number(raw);
    return port >= 1 && port <= 65535 ? port : null;
}

function exposedPorts(service: Record<string, any>) {
    if (service.expose === undefined) return [];
    if (!Array.isArray(service.expose)) throw new ComposePolicyError('Service expose must be a list', 'COMPOSE_INVALID_SCHEMA');
    return [...new Set(service.expose.map(parsePort).filter((port): port is number => port !== null))];
}

function publishedTargetPorts(service: Record<string, any>) {
    if (service.ports === undefined) return [];
    if (!Array.isArray(service.ports)) throw new ComposePolicyError('Service ports must be a list', 'COMPOSE_INVALID_SCHEMA');

    return [...new Set(service.ports.map((entry: unknown) => {
        const config = record(entry);
        if (config) return parsePort(config.target);
        const raw = String(entry ?? '').split('/')[0];
        return parsePort(raw.split(':').at(-1));
    }).filter((port): port is number => port !== null))];
}

function sanitizeExtraHosts(value: unknown, serviceName: string) {
    if (value === undefined || value === null || value === false) return undefined;
    const entries = Array.isArray(value) ? value : [value];
    const safeEntries = entries.filter((entry) => {
        if (typeof entry === 'string') {
            return /^host\.docker\.internal(?::|=)host-gateway$/i.test(entry.trim());
        }
        const config = record(entry);
        return config?.['host.docker.internal'] === 'host-gateway';
    });
    if (safeEntries.length === 0) return undefined;
    if (safeEntries.length > 1) {
        throw new ComposePolicyError(`Service ${serviceName} defines host.docker.internal more than once`, 'COMPOSE_INVALID_SCHEMA');
    }
    return ['host.docker.internal:host-gateway'];
}

function validateNamedVolume(volume: unknown, serviceName: string) {
    if (typeof volume === 'string') {
        const [source, target] = volume.split(':');
        if (!source || !target || !volumeNamePattern.test(source) || !target.startsWith('/')) {
            throw new ComposePolicyError(`Service ${serviceName} may only use named volumes`, 'COMPOSE_UNSAFE_VOLUME');
        }
        if (target === '/var/run/docker.sock') throw new ComposePolicyError('Docker socket mounts are forbidden', 'COMPOSE_DOCKER_SOCKET_FORBIDDEN');
        return source;
    }

    const value = record(volume);
    if (!value || value.type !== 'volume' || typeof value.source !== 'string' || !volumeNamePattern.test(value.source) || typeof value.target !== 'string' || !value.target.startsWith('/')) {
        throw new ComposePolicyError(`Service ${serviceName} may only use named volumes`, 'COMPOSE_UNSAFE_VOLUME');
    }
    if (value.target === '/var/run/docker.sock') throw new ComposePolicyError('Docker socket mounts are forbidden', 'COMPOSE_DOCKER_SOCKET_FORBIDDEN');
    return value.source;
}

export class ComposePolicyService {
    static sanitize(source: string, selection: ComposeSelection = {}, managedPrefix = 'deployforge-managed', resourcePolicy?: EffectiveResourcePolicy | null, hardStorageLimit = false, managedDeploymentId?: string): SanitizedCompose {
        if (Buffer.byteLength(source, 'utf8') > 512 * 1024) {
            throw new ComposePolicyError('Compose file exceeds the 512 KiB policy limit', 'COMPOSE_TOO_LARGE');
        }

        const document = parseDocument(source, { uniqueKeys: true });
        if (document.errors.length) {
            throw new ComposePolicyError(`Invalid Compose YAML: ${document.errors[0].message}`, 'COMPOSE_INVALID_YAML');
        }
        const compose = record(document.toJS({ maxAliasCount: 0 }));
        const services = record(compose?.services);
        if (!compose || !services || Object.keys(services).length === 0) {
            throw new ComposePolicyError('Compose file must define at least one service', 'COMPOSE_INVALID_SCHEMA');
        }
        for (const key of Object.keys(compose)) {
            if (!['services', 'volumes', 'networks', 'name', 'version'].includes(key) && !key.startsWith('x-')) {
                throw new ComposePolicyError(`Unsupported top-level Compose option: ${key}`, 'COMPOSE_FORBIDDEN_OPTION');
            }
        }
        if (Object.keys(services).length > 4) {
            throw new ComposePolicyError('Compose deployments support at most 4 services', 'COMPOSE_SERVICE_LIMIT');
        }
        if (compose.secrets || compose.configs) {
            throw new ComposePolicyError('Compose secrets/config file mounts are not supported; use encrypted environment variables', 'COMPOSE_UNSAFE_MOUNT');
        }

        const declaredVolumes = record(compose.volumes) || {};
        const declaredNetworks = record(compose.networks) || {};
        const candidates: ComposeIngressCandidate[] = [];
        const usedVolumes = new Set<string>();

        for (const [name, rawService] of Object.entries(services)) {
            if (!serviceNamePattern.test(name)) throw new ComposePolicyError(`Invalid Compose service name: ${name}`, 'COMPOSE_INVALID_SCHEMA');
            const service = record(rawService);
            if (!service) throw new ComposePolicyError(`Service ${name} must be an object`, 'COMPOSE_INVALID_SCHEMA');

            for (const key of forbiddenServiceKeys) {
                if (service[key] !== undefined && service[key] !== false && service[key] !== null) {
                    throw new ComposePolicyError(`Service ${name} uses forbidden option: ${key}`, 'COMPOSE_FORBIDDEN_OPTION');
                }
                delete service[key];
            }
            const declaredPorts = [...new Set([...exposedPorts(service), ...publishedTargetPorts(service)])];
            service.extra_hosts = sanitizeExtraHosts(service.extra_hosts, name);
            if (service.extra_hosts === undefined) delete service.extra_hosts;
            delete service.container_name;
            delete service.ports;
            delete service.labels;
            delete service.cpus;
            delete service.mem_limit;
            delete service.mem_reservation;
            delete service.memswap_limit;
            delete service.pids_limit;
            delete service.logging;
            delete service.storage_opt;
            if (service.deploy) {
                delete service.deploy.resources;
                if (Object.keys(service.deploy).length === 0) delete service.deploy;
            }
            service.security_opt = ['no-new-privileges:true'];
            service.cap_drop = ['ALL'];

            if (service.build !== undefined) {
                if (typeof service.build === 'string') {
                    safeRelativePath(service.build, `Service ${name} build context`);
                    service.build = { context: service.build };
                } else {
                    const build = record(service.build);
                    if (!build) throw new ComposePolicyError(`Service ${name} build must be a path or object`, 'COMPOSE_INVALID_SCHEMA');
                    safeRelativePath(build.context ?? '.', `Service ${name} build context`);
                    if (build.dockerfile !== undefined) safeRelativePath(build.dockerfile, `Service ${name} Dockerfile`);
                    if (build.additional_contexts !== undefined) throw new ComposePolicyError('Additional build contexts are forbidden', 'COMPOSE_UNSAFE_BUILD_CONTEXT');
                }
                service.build.labels = {
                    'com.deployforge.managed': 'true',
                    'com.deployforge.project': managedPrefix,
                    ...(managedDeploymentId ? { 'com.deployforge.deployment': managedDeploymentId } : {}),
                };
            }
            if (service.env_file !== undefined) {
                const files = Array.isArray(service.env_file) ? service.env_file : [service.env_file];
                for (const file of files) safeRelativePath(typeof file === 'string' ? file : file?.path, `Service ${name} env_file`);
            }
            if (service.volumes !== undefined) {
                if (!Array.isArray(service.volumes)) throw new ComposePolicyError(`Service ${name} volumes must be a list`, 'COMPOSE_INVALID_SCHEMA');
                for (const volume of service.volumes) usedVolumes.add(validateNamedVolume(volume, name));
            }

            const ports = declaredPorts;
            const imageHint = typeof service.image === 'string' ? service.image : '';
            if (!infrastructurePattern.test(`${name} ${imageHint}`)) candidates.push({ service: name, ports });
        }

        for (const name of usedVolumes) {
            if (!(name in declaredVolumes)) declaredVolumes[name] = {};
        }
        for (const [name, definition] of Object.entries(declaredVolumes)) {
            if (!volumeNamePattern.test(name)) throw new ComposePolicyError(`Invalid named volume: ${name}`, 'COMPOSE_INVALID_SCHEMA');
            const config = record(definition) || {};
            if (config.external || config.driver_opts || (config.driver && config.driver !== 'local')) {
                throw new ComposePolicyError(`Volume ${name} must be a local managed volume`, 'COMPOSE_UNSAFE_VOLUME');
            }
            declaredVolumes[name] = {};
        }
        for (const [name, definition] of Object.entries(declaredNetworks)) {
            if (!volumeNamePattern.test(name)) throw new ComposePolicyError(`Invalid network name: ${name}`, 'COMPOSE_INVALID_SCHEMA');
            const config = record(definition) || {};
            if (config.external || (config.driver && config.driver !== 'bridge')) {
                throw new ComposePolicyError(`Network ${name} must be an internal managed bridge`, 'COMPOSE_UNSAFE_NETWORK');
            }
            declaredNetworks[name] = { driver: 'bridge' };
        }
        if (!declaredNetworks.default) declaredNetworks.default = { driver: 'bridge' };

        if (candidates.length === 0) throw new ComposePolicyError('No web service candidate was found', 'COMPOSE_INGRESS_NOT_FOUND');
        const conventionalTarget = !selection.composeService
            ? candidates.find((candidate) => /^(web|frontend|app|client)$/i.test(candidate.service))
            : undefined;
        if (candidates.length > 1 && !selection.composeService && !conventionalTarget) {
            throw new ComposePolicyError('Multiple web services found; composeService and composePort are required', 'COMPOSE_INGRESS_AMBIGUOUS', candidates);
        }
        const target = selection.composeService
            ? candidates.find((candidate) => candidate.service === selection.composeService)
            : conventionalTarget || candidates[0];
        if (!target) throw new ComposePolicyError('Selected composeService is not an ingress candidate', 'COMPOSE_INGRESS_INVALID', candidates);

        const explicitPort = selection.composePort == null ? null : Number(selection.composePort);
        if (explicitPort !== null && (!Number.isInteger(explicitPort) || explicitPort < 1 || explicitPort > 65535)) {
            throw new ComposePolicyError('composePort must be between 1 and 65535', 'COMPOSE_INGRESS_INVALID', candidates);
        }
        if (target.ports.length > 1 && explicitPort === null) {
            throw new ComposePolicyError('Selected service exposes multiple ports; composePort is required', 'COMPOSE_INGRESS_AMBIGUOUS', candidates);
        }
        const port = explicitPort ?? target.ports[0] ?? 3000;
        const targetService = services[target.service] as Record<string, any>;
        targetService.expose = [...new Set([...(targetService.expose || []), port])];

        if (resourcePolicy) {
            const allocations = splitComposePolicy(resourcePolicy, Object.keys(services), target.service);
            for (const [name, service] of Object.entries(services)) {
                const allocation = allocations[name];
                service.cpus = (allocation.cpuMillis / 1000).toFixed(3);
                service.mem_limit = `${allocation.memoryMiB}m`;
                service.memswap_limit = `${allocation.memoryMiB}m`;
                service.pids_limit = allocation.pids;
                service.logging = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '10' } };
                if (hardStorageLimit) service.storage_opt = { size: `${Math.max(256, Math.floor(resourcePolicy.storageMiB / Object.keys(services).length))}m` };
                service.labels = {
                    'com.deployforge.managed': 'true',
                    'com.deployforge.project': managedPrefix,
                    ...(managedDeploymentId ? { 'com.deployforge.deployment': managedDeploymentId } : {}),
                };
            }
        }

        delete compose.name;
        delete compose.version;
        compose.services = services;
        compose.volumes = declaredVolumes;
        compose.networks = declaredNetworks;
        const yaml = stringify(compose, { lineWidth: 0 });

        const dependencyServices = Object.fromEntries(Object.entries(services).filter(([name]) => name !== target.service));
        for (const [name, dependency] of Object.entries(dependencyServices)) {
            const dependsOn = Array.isArray(dependency.depends_on)
                ? dependency.depends_on
                : Object.keys(record(dependency.depends_on) || {});
            if (dependsOn.includes(target.service)) {
                throw new ComposePolicyError(`Dependency service ${name} cannot depend on the ingress service`, 'COMPOSE_DEPENDENCY_CYCLE');
            }
            dependency.networks = ['default'];
        }
        const hasDependencies = Object.keys(dependencyServices).length > 0;
        const stableVolumes = Object.fromEntries(Object.keys(declaredVolumes).map((name) => [name, { name: `${managedPrefix}-volume-${name}` }]));
        const dependencyCompose = hasDependencies ? {
            services: dependencyServices,
            volumes: stableVolumes,
            networks: { default: { driver: 'bridge', labels: { 'com.deployforge.managed': 'true', 'com.deployforge.project': managedPrefix } } },
        } : null;
        const dependencyYaml = dependencyCompose ? stringify(dependencyCompose, { lineWidth: 0 }) : null;
        const dependencyFingerprint = crypto.createHash('sha256').update(dependencyYaml || 'no-dependencies').digest('hex');

        const candidateService = structuredClone(targetService);
        delete candidateService.depends_on;
        candidateService.networks = hasDependencies ? ['deployforge-dependencies'] : ['default'];
        const candidateCompose = {
            services: { [target.service]: candidateService },
            volumes: stableVolumes,
            networks: hasDependencies
                ? { 'deployforge-dependencies': { external: true, name: `${managedPrefix}-dependencies_default` } }
                : { default: { driver: 'bridge', labels: { 'com.deployforge.managed': 'true', 'com.deployforge.project': managedPrefix } } },
        };
        return {
            yaml,
            candidateYaml: stringify(candidateCompose, { lineWidth: 0 }),
            dependencyYaml,
            dependencyFingerprint,
            hasDependencies,
            service: target.service,
            port,
            candidates,
        };
    }
}

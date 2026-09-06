/**
 * RequirementsDetector
 *
 * Pure static analysis — no SSH, no I/O. Takes the list of file paths
 * found in the project and returns the runtimes/tools the project requires.
 *
 * Safety rules:
 *  - Only reads the file *names*, not their content (content is passed in separately).
 *  - Version hints are extracted from well-known config files via safe regex/JSON parse.
 *  - Never executes any code from project files.
 */

import { DetectedRuntime, RuntimeName } from './types';

/** Raw file-content map keyed by the relative file path. */
export type ProjectFileContents = Record<string, string>;

export class RequirementsDetector {

    /**
     * Detect required runtimes from a project's file list and optional file contents.
     *
     * @param files    List of relative file paths found in the project root (up to depth 3).
     * @param contents Map of file path → raw file text for files that are available
     *                 (used for version extraction). Missing entries are skipped gracefully.
     */
    static detect(files: string[], contents: ProjectFileContents = {}): DetectedRuntime[] {
        const fileSet = new Set(files.map((f) => f.replace(/^\.\//, '')));
        const requirements: DetectedRuntime[] = [];

        const add = (name: RuntimeName, version: string | null, sourceFile: string) => {
            // Deduplicate by name — keep first (most specific) detection
            if (!requirements.find((r) => r.name === name)) {
                requirements.push({ name, requiredVersion: version, sourceFile });
            }
        };

        // ── Docker Compose ─────────────────────────────────────────────────────
        const composeFile = fileSet.has('docker-compose.yml') ? 'docker-compose.yml'
            : fileSet.has('docker-compose.yaml') ? 'docker-compose.yaml'
            : fileSet.has('compose.yml') ? 'compose.yml'
            : fileSet.has('compose.yaml') ? 'compose.yaml'
            : null;

        if (composeFile) {
            add('docker', null, composeFile);
            add('docker-compose', null, composeFile);

            // If compose is present, detect service-level dependencies (redis, postgres, mysql, nginx)
            const composeContent = contents[composeFile] || '';
            this.detectComposeServices(composeContent, composeFile, add);

            // Docker projects: host-side language runtimes are NOT needed on the host
            return requirements;
        }

        // ── Dockerfile only (no compose) ──────────────────────────────────────
        if (fileSet.has('Dockerfile')) {
            add('docker', null, 'Dockerfile');
            // Same rule: Docker projects only need Docker on the host
            return requirements;
        }

        // ── Node.js / Package Manager ──────────────────────────────────────────
        if (fileSet.has('package.json')) {
            const nodeVersion = this.extractNodeVersion(contents, fileSet);
            add('nodejs', nodeVersion, 'package.json');
            add('npm', null, 'package.json');
        }

        if (fileSet.has('pnpm-lock.yaml')) {
            add('nodejs', this.extractNodeVersion(contents, fileSet), 'pnpm-lock.yaml');
            add('pnpm', null, 'pnpm-lock.yaml');
        } else if (fileSet.has('yarn.lock')) {
            add('nodejs', this.extractNodeVersion(contents, fileSet), 'yarn.lock');
            add('yarn', null, 'yarn.lock');
        } else if (fileSet.has('bun.lock') || fileSet.has('bun.lockb')) {
            const lockFile = fileSet.has('bun.lock') ? 'bun.lock' : 'bun.lockb';
            add('nodejs', this.extractNodeVersion(contents, fileSet), lockFile);
            add('bun', null, lockFile);
        } else if (fileSet.has('package-lock.json')) {
            add('nodejs', this.extractNodeVersion(contents, fileSet), 'package-lock.json');
        }

        // ── Python ─────────────────────────────────────────────────────────────
        if (fileSet.has('requirements.txt')) {
            add('python', null, 'requirements.txt');
        }

        if (fileSet.has('pyproject.toml')) {
            const pyVersion = this.extractPythonVersion(contents['pyproject.toml'] || '');
            add('python', pyVersion, 'pyproject.toml');
        }

        if (fileSet.has('Pipfile')) {
            const pipfileVersion = this.extractPipfileVersion(contents['Pipfile'] || '');
            add('python', pipfileVersion, 'Pipfile');
        }

        if (fileSet.has('.python-version')) {
            const rawVersion = (contents['.python-version'] || '').trim();
            add('python', rawVersion || null, '.python-version');
        }

        // ── Java ───────────────────────────────────────────────────────────────
        if (fileSet.has('pom.xml')) {
            const javaVersion = this.extractJavaVersionFromPom(contents['pom.xml'] || '');
            add('java', javaVersion, 'pom.xml');
        }

        if (fileSet.has('build.gradle') || fileSet.has('build.gradle.kts')) {
            const gradleFile = fileSet.has('build.gradle') ? 'build.gradle' : 'build.gradle.kts';
            const javaVersion = this.extractJavaVersionFromGradle(contents[gradleFile] || '');
            add('java', javaVersion, gradleFile);
        }

        // ── Go ─────────────────────────────────────────────────────────────────
        if (fileSet.has('go.mod')) {
            const goVersion = this.extractGoVersion(contents['go.mod'] || '');
            add('go', goVersion, 'go.mod');
        }

        // ── PHP ─────────────────────────────────────────────────────────────────
        if (fileSet.has('composer.json')) {
            const phpVersion = this.extractPhpVersion(contents['composer.json'] || '');
            add('php', phpVersion, 'composer.json');
        }

        // ── Ruby ───────────────────────────────────────────────────────────────
        if (fileSet.has('Gemfile')) {
            const rubyVersion = this.extractRubyVersion(contents['Gemfile'] || '');
            add('ruby', rubyVersion, 'Gemfile');
        }

        return requirements;
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    private static extractNodeVersion(contents: ProjectFileContents, fileSet: Set<string>): string | null {
        // 1. .nvmrc is the most explicit
        if (fileSet.has('.nvmrc')) {
            const raw = (contents['.nvmrc'] || '').trim().replace(/^v/, '');
            if (raw) return raw;
        }

        // 2. .node-version
        if (fileSet.has('.node-version')) {
            const raw = (contents['.node-version'] || '').trim().replace(/^v/, '');
            if (raw) return raw;
        }

        // 3. package.json engines.node
        if (contents['package.json']) {
            try {
                const pkg = JSON.parse(contents['package.json']);
                const engineNode = pkg?.engines?.node;
                if (typeof engineNode === 'string') {
                    // Strip range operators like >=, ^, ~ to get the base version
                    const cleaned = engineNode.replace(/[^0-9.x*]/g, '').split('||')[0].trim();
                    if (cleaned) return cleaned;
                }
            } catch { /* malformed package.json */ }
        }

        return null;
    }

    private static extractPythonVersion(pyprojectContent: string): string | null {
        // python_requires = ">=3.12"
        const match = pyprojectContent.match(/python_requires\s*=\s*["']([^"']+)["']/);
        if (match) {
            return match[1].replace(/[^0-9.]/g, '').trim() || null;
        }
        // [tool.python] version = "3.12"
        const verMatch = pyprojectContent.match(/\[tool\.python\][\s\S]*?version\s*=\s*["']([^"']+)["']/);
        if (verMatch) return verMatch[1].trim() || null;
        return null;
    }

    private static extractPipfileVersion(pipfileContent: string): string | null {
        // python_version = "3.12"
        const match = pipfileContent.match(/python_version\s*=\s*["']([^"']+)["']/);
        if (match) return match[1].trim() || null;
        return null;
    }

    private static extractJavaVersionFromPom(pomContent: string): string | null {
        // <java.version>21</java.version>  or  <maven.compiler.source>21</maven.compiler.source>
        const patterns = [
            /<java\.version>(\d+(?:\.\d+)*)<\/java\.version>/,
            /<maven\.compiler\.source>(\d+(?:\.\d+)*)<\/maven\.compiler\.source>/,
            /<release>(\d+)<\/release>/,
        ];
        for (const p of patterns) {
            const m = pomContent.match(p);
            if (m) return m[1];
        }
        return null;
    }

    private static extractJavaVersionFromGradle(gradleContent: string): string | null {
        // sourceCompatibility = '21'  /  java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
        const patterns = [
            /sourceCompatibility\s*=\s*['"]?(\d+(?:\.\d+)*)['"]?/,
            /JavaLanguageVersion\.of\((\d+)\)/,
            /languageVersion\.set\(JavaLanguageVersion\.of\((\d+)\)\)/,
        ];
        for (const p of patterns) {
            const m = gradleContent.match(p);
            if (m) return m[1];
        }
        return null;
    }

    private static extractGoVersion(goModContent: string): string | null {
        // go 1.22
        const match = goModContent.match(/^go\s+([\d.]+)/m);
        return match ? match[1] : null;
    }

    private static extractPhpVersion(composerContent: string): string | null {
        try {
            const composer = JSON.parse(composerContent);
            const req = composer?.require?.php || '';
            if (req) return req.replace(/[^0-9.]/g, '').trim() || null;
        } catch { /* ignore */ }
        return null;
    }

    private static extractRubyVersion(gemfileContent: string): string | null {
        // ruby '3.3.0'  or  ruby "3.3"
        const match = gemfileContent.match(/^ruby\s+['"]([^'"]+)['"]/m);
        return match ? match[1].trim() : null;
    }

    /** Detect infrastructure services referenced in a docker-compose file. */
    private static detectComposeServices(
        composeContent: string,
        sourceFile: string,
        add: (name: RuntimeName, version: string | null, file: string) => void,
    ) {
        if (!composeContent) return;

        // Look for well-known image names under the services: block
        if (/image\s*:\s*['"]?redis/i.test(composeContent)) {
            add('redis', null, sourceFile);
        }
        if (/image\s*:\s*['"]?postgres/i.test(composeContent)) {
            add('postgresql', null, sourceFile);
        }
        if (/image\s*:\s*['"]?mysql/i.test(composeContent)) {
            add('mysql', null, sourceFile);
        }
        if (/image\s*:\s*['"]?nginx/i.test(composeContent)) {
            add('nginx', null, sourceFile);
        }
    }
}

# Dependency inventory

Direct runtime dependency: cryptography. Its transitive Python dependencies are
cffi and pycparser. Python and SQLite are supplied by the host Python runtime.

| Component | Pinned version | Purpose | Upstream license |
| --- | --- | --- | --- |
| cryptography | 50.0.1 | AES-GCM, HKDF and Ed25519 | Apache-2.0 OR BSD-3-Clause |
| cffi | 2.1.1 | cryptography dependency | MIT-0 |
| pycparser | 3.0 | cffi dependency | BSD-3-Clause |
| setuptools | 84.0.0 | Build tooling | MIT |
| Ruff | 0.12.12 | Development linting | MIT |

The lock files contain the exact versions and PyPI wheel SHA-256 hashes. The
source snapshot includes no third-party wheels or vendored model weights. Wheels
can bundle native components with additional notices; retain those notices in
any distributed application and generate an SBOM before production packaging.

Optional independent audit uses the directly pinned boto3 1.43.85 extra
(Apache-2.0). It is not needed for local tests or the CLI demo. SDK installation
and a full transitive hash lock could not be completed with current package-network
access; do not treat this optional deployment dependency as verified. The S3
tests use an explicit contract simulator, not boto3 or live AWS. See HARDENING.md.

Primary metadata:

- [cryptography](https://pypi.org/project/cryptography/50.0.1/)
- [cffi](https://pypi.org/project/cffi/2.1.1/)
- [pycparser](https://pypi.org/project/pycparser/3.0/)
- [setuptools](https://pypi.org/project/setuptools/84.0.0/)
- [Ruff](https://pypi.org/project/ruff/0.12.12/)

GitHub Actions dependencies are pinned to full commits in the CI file. They are
development infrastructure and are not loaded by Jarvis. No public license for
Jarvis-owned source is granted by the presence of open-source dependencies.

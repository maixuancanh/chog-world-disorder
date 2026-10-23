# Hosting

Build and serve `dist/`. Configure HTTPS `/relay/:path*` to proxy to the relay HTTPS origin. Browser and worker must use compatible game versions. Never publish the private data directory.

Build the container from the repository root:

```sh
docker build -f server/cloud/Dockerfile -t chog-relay .
```

Chromium runs as a non-root user with its normal sandbox. The host must support the sandbox and sustain real-time simulation. A healthy HTTP endpoint alone is not a gameplay performance check.

Cloud startup requires a durable database URL and scoped credential, the authorized testnet signing credential, operator address, allowed origins and deployment configuration. Exact variable names and validation are in `server/cloud/provision.mjs`. Supply values through the host's secret store. Deployment configuration maps `vault.json`, `faucet.json`, `progression.json`, `raid-pool.json` and `mode-registry.json` to their service configuration objects.

The cloud asset bridge fetches runtime files from the public frontend. `PORT` selects the listener. Use `CHOG_CLOUD_MAINTENANCE=1` during validation; it blocks gameplay mutations and automatic chain synchronization.

## Migrating an existing service

1. Test an isolated full match, simulation speed and worker errors.
2. Stop admission, finish active matches and stop the old writer.
3. Back up the ledger and private configuration outside the repository.
4. Restore durable storage and transfer credentials privately.
5. Verify counts, balances, progression and signer identity.
6. Start one writer, update the frontend proxy and test login, completion and settlement.
7. Restart and confirm persistence before retiring the old service.

Never run two automatic progression/registry writers for one deployment. Retain the old backup until the migration is verified.

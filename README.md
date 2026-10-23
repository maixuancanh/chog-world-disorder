# CHOG World Disorder

A browser action game where CHOG NFTs supply playable characters, match objectives, combat roles and persistent progression.

**[Play online](https://chog-world-disorder.vercel.app/)** · [Local setup](#local-setup) · [NFT integration](#nft-integration) · [CHOG economy](#chog-economy)

![Genesis Plaza](assets/stages/tidewater-day.webp)

## Game modes

| Mode | Players | Objective |
| --- | --- | --- |
| **Quick Play / Trait Hunt** | Six, including bots | Restore the carrier NFT by finding its exact traits before five minutes expire. |
| **Boss Battle** | Six cooperative CHOGs | Defeat Hullbreaker across three phases within four minutes. |
| **Trait Control** | Three versus three | Capture three stations. Reach 100 points or lead after four minutes. |
| **Daily Trials** | Solo | Secure eight beacons, holding each active ring for three seconds under fixed daily rules. |

**Online rooms** use Trait Hunt rules. Create a room, copy its five-character code and invite friends. Connected players appear with names and NFT portraits. Bots fill empty slots when the match starts.

**Skill Workshop** is a loadout builder. Choose an effect, target and modifier within a five-point budget, then use the recipe in Boss Battle or Trait Control. Daily Trials keeps its fixed loadout.

### Trait Hunt

An eligible NFT holder becomes the carrier. Actual NFT metadata supplies the missing traits. The carrier opens trait chests; hunters try to capture the carrier and take over the objective. Collected traits carry over after a capture.

Each player starts with five rounds. Carrier hits stun hunters; hunter hits can eliminate the carrier. Players may buy three additional rounds for 3 CHOG, at most twice per match. Supply drops provide additional opportunities.

Completing the objective awards 20 CHOG; other players receive 2 CHOG. On timeout, everyone receives 2 CHOG. These are testnet game rules; withdrawals require verified settlement and a funded vault.

### Boss Battle

NFT traits assign **Breaker**, **Guardian** or **Medic** roles and supply squad shield requirements. Match traits to counter shields and combine damage, protection and healing. Contribution is tracked for raid rewards.

Boss wins unlock Rally after one victory and Second Wind after three. Workshop options also use NFT-bound win progression. Quick, for example, changes Mend from 18 HP every 18 seconds to 12 HP every 12 seconds. Trait requirements, unlock conditions and the power budget constrain recipes.

### Daily Trials

The date determines the challenge. Completing beacons adds score; finishing all eight adds a remaining-time bonus. Guest scores stay local. Verified wallet results are recorded by the server and can be synchronized to the mode registry.

## NFT integration

- **Identity:** Genesis artwork and metadata, player portraits, matching animated 3D characters and post-match character reveals.
- **Objectives:** Trait Hunt uses the target NFT's actual traits.
- **Team composition:** Boss Battle derives roles and phase requirements from squad NFTs.
- **Progression:** EXP is stored by collection address and token ID. It follows that identity when ownership changes; authenticated play checks ownership.
- **Skills:** recipes identify the collection and token. Traits and boss wins constrain options. Signed-in players can request an onchain save.
- **Records:** supported verified outcomes and recipe commitments can be recorded in the mode registry. Guest scores and local previews are not verified blockchain records.

The current integration uses **Monad testnet**, Genesis replica NFTs and **testCHOG**. The replica preserves original artwork and metadata mapping, but is a separate contract. It does not establish mainnet NFT ownership. Mainnet CHOG and mainnet NFTs are not transferred. Artwork and character assets retain their respective owners' rights.

## CHOG economy

### Game balance and withdrawals

Verified matches run in isolated headless Chromium workers controlled by the relay. The server observes outcomes, settles the ledger and tracks EXP. The player browser cannot simply submit an arbitrary reward amount.

Rewards first enter the game balance. Withdrawals use signed, expiring vouchers and the funded reward vault. The wallet confirms the onchain claim and pays testnet gas. Pending withdrawals are reconciled to prevent duplicate credit.

Guest practice uses local storage and does not create withdrawable blockchain rewards.

### Boss Raid Pool

Players stake **CHOG** while keeping the NFT in their wallet. The operator separately funds a reward campaign. Raid contribution affects the claim; principal and reward reserves remain separate.

Displayed incentive APR depends on funding and total stake. It is not guaranteed APY or income from an external yield protocol. A seven-day campaign is independent of a four-minute boss match. Pool actions require wallet confirmation.

### Testnet contracts

**Monad Testnet — chain ID 10143.** Public configuration and artifacts are in `assets/chog-testnet/`.

| Contract | Address |
| --- | --- |
| Genesis replica | `0xd6F8a7262Ff96A87cc6A96CeC82c616Ceb8ec678` |
| testCHOG | `0x5264B3A7fb6C8141845138Be8de57dED04f8dA4F` |
| Reward vault | `0xe4B4187928cD620f97dD3B3D36156E79D22ffC9E` |
| Faucet | `0x8A02d5DFf3a39088532a8B62215c2a5349c5C8A6` |
| NFT progression | `0x67c800a7F4018103AA922384aaFfFaA85c0AB901` |
| Boss Raid Pool | `0x0a0aD19e2E4FABC39955CbD8D6377f2e3EAE396F` |
| Mode registry | `0xd525eBb84b64d56F99fA0B51772Cba4307B51bfc` |

Check transactions in the [Monad testnet explorer](https://testnet.monadscan.com/). Deployment alone does not establish sufficient faucet or reward funding.

## Weapons and controls

Five weapons: **Rascal**, **Double Trouble**, **Whirlwind**, **Longshot** and **Party Crasher**. Selection locks on click.

| Action | Input |
| --- | --- |
| Move / aim | WASD / mouse |
| Fire | Left mouse; hold/release for charge weapons |
| Jump | Space |
| Open chest | Hold E in Trait Hunt |
| NFT / Workshop power | F in supported modes |
| Weapon special | Q |
| Map | Hold Tab |
| Super jump | Click an eligible pin or use its displayed number |
| Pause | Escape |

Controller and touch input are supported. The in-game reference shows controls for the active device.

## Local setup

Requirements: **Node.js 24.14+**, npm, Python 3, a WebGL browser and Chrome/Chromium or Edge for verified simulations.

```sh
git clone https://github.com/maixuancanh/chog-world-disorder.git
cd chog-world-disorder
npm ci
npm ci --prefix contracts/demo
npm ci --prefix server/cloud
npm run build
npm run serve -- 8803
```

Open **http://127.0.0.1:8803/dist/**. Guest practice requires no wallet or contract deployment.

Start online rooms and the reward service in a second terminal:

```sh
npm run hunt-relay
```

The relay uses port **8805**, loading workers from `http://127.0.0.1:8803/dist/`. Set `CHOG_BROWSER_PATH` when automatic browser detection is unavailable. Use `?huntRelay=http://127.0.0.1:8805` to explicitly select a relay. Public HTTPS hosting uses a same-origin `/relay` proxy.

### Operator setup

Open **http://127.0.0.1:8803/testnet.html** with the intended operator wallet on Monad testnet. It provides contract deployment, configuration and funding controls. These actions require testnet transactions.

The relay creates its signer and SQLite ledger outside the repository under the user's `.chog-game-server` directory. A fresh installation creates a new signer. Deployed contracts must authorize that signer; cloning source does not grant access to the existing deployment.

Use persistent storage, keep backups and run one writer per ledger. Keep signer files and database credentials private. Changing a live signer also requires updating the relevant contracts.

### Configuration

| Variable | Purpose |
| --- | --- |
| `CHOG_RELAY_PORT` | Listener port; default 8805. |
| `CHOG_GAME_URL` | Worker game URL; default local `/dist/`. |
| `CHOG_BROWSER_PATH` | Chrome/Chromium executable. |
| `CHOG_DATA_DIR` | Private signer, configuration and ledger directory. |
| `CHOG_RPC_URL` | Monad testnet RPC. |
| `CHOG_ALLOWED_ORIGINS` | Comma-separated permitted browser origins. |
| `CHOG_OPERATOR_ADDRESS` | Authorized operator's public address. |
| `CHOG_MAX_REWARD_ROOMS` | Concurrent workers; default 2. |
| `CHOG_MAX_QUEUED_ROOMS` | Queue capacity; default 16. |
| `CHOG_DATABASE_URL`, `CHOG_DATABASE_AUTH_TOKEN` | Optional durable remote database. |

The external-host runtime is in `server/cloud/`; see [hosting notes](docs/DEPLOYMENT.md).

## Architecture

```text
Browser: Three.js, controls, HUD, menus and wallet UI
   | inputs, room commands and login signature
Relay: sessions, rooms, queue and authoritative browser workers
   | verified results
Ledger: balances, withdrawals, NFT EXP, raid statistics and records
   | vouchers and authorized synchronization
Monad testnet: vault, faucet, progression, raid pool and mode registry
```

| Directory | Contents |
| --- | --- |
| `src/`, `styles/` | Engine, CHOG rules, UI and wallet integration. |
| `assets/` | Runtime models, textures, fonts, metadata and public artifacts. |
| `server/` | Relay, ledger, simulation workers and cloud runtime. |
| `contracts/demo/` | Solidity, artifact builders and contract tests. |
| `tools/chog/` | Gameplay/service tests and build tools. |
| `vendor/` | Browser Three.js modules and dependencies. |

## Build and verification

```sh
npm run check
npm test
npm run contracts:test
npm run build
```

Inside `contracts/demo`, run `npm run build`, `npm run build:rewards`, `npm run build:faucet` or `npm run build:progression` to compile artifacts. `node build-raid-pool.mjs` and `node build-mode-registry.mjs` compile the other contracts. Compilation does not deploy or fund contracts.

After changing world props, regenerate authoritative collision data:

```sh
node tools/chog/build-simulation-colliders.mjs
npm run build
```

The build checks the source fingerprint to prevent visual geometry and authoritative collision data from diverging.

## Deployment status

The frontend is hosted on Vercel. The active relay currently uses a temporary tunnel to the development machine; availability depends on that machine and tunnel. Permanent VPS migration is pending. Oracle A1 allocation was unavailable at the last attempt. Render Free was measured below real-time simulation throughput and is not the active gameplay backend.

Wallet rewards require a reachable relay, valid sign-in, authorized contracts, treasury funding and testnet gas. Passing tests and deployed addresses do not guarantee continuous availability or funded withdrawals.

## License

MIT. See [LICENSE](LICENSE).

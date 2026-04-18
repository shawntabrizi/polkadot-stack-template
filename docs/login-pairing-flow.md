# Login/Pairing Flow: Mobile <-> Desktop

The two apps use an **SSO (Single Sign-On) pairing protocol** built on top of the **Statement Store pallet** on the Polkadot blockchain. There's no traditional WebSocket or server-mediated connection -- all communication goes through on-chain statements.

## The Flow

### 1. Desktop generates a QR code

The desktop app (`OnboardingScreen.tsx`) displays a QR code containing a deep link:

```
polkadot://pair?handshake=<SCALE_ENCODED_DATA>
```

The handshake payload contains:

- `statementStorePublicKey` (32 bytes) -- for writing to the Statement Store
- `sharedSecretPublicKey` (65 bytes) -- for deriving an encrypted channel
- `hostMetadata` URL -- so mobile can fetch the desktop app's name/icon

### 2. Mobile scans and parses

- `SsoPairingScanContentParser` parses the QR content
- `PairDeepLinkHandler` intercepts the `polkadot://pair` deep link
- `SsoHandshakeProtocol` decodes the SCALE-encoded handshake offer

### 3. User approves on mobile

`PairRequestScreen` shows a bottom sheet with:

- The desktop app's name and icon (fetched from `hostMetadataUrl`)
- The mobile user's username
- Approve / Reject buttons

### 4. Cryptographic handshake

On approval (`RealSsoHandshakeUseCase`):

1. Mobile derives encryption keys using the desktop's `sharedSecretPublicKey` and the derivation domain `"//wallet//sso"`
2. Mobile prepares a `HandshakeAnswer` containing its session encryption public key and user account ID
3. The answer is encrypted and submitted as a **statement** to the Statement Store pallet, addressed to the desktop via:
   - `topic` = Blake2b256(`sharedSecretPublicKey + "topic"`)
   - `channel` = Blake2b256(`sharedSecretPublicKey + "channel"`)

### 5. Session established

- Desktop reads the statement from the chain and decrypts the answer
- Both sides now share a derived secret for encrypted communication
- Mobile persists the session in SQLite (`SsoSessionRepository`)

### 6. Ongoing communication

`RealCommunicationSession` polls the Statement Store for new messages. The desktop can send:

- **SigningRequest** -- asks mobile to sign a transaction
- **AliasRequest** -- asks for a contextual alias for an account

Mobile responds with signed payloads or alias results, all encrypted with per-message temporary keys.

## Key Files

| Concern | Mobile | Desktop |
|---------|--------|---------|
| QR / Deep link | `feature/sso/impl/deeplink/PairDeepLinkHandler.kt` | `src/features/onboarding/ui/OnboardingScreen.tsx` |
| Handshake protocol | `feature/sso/impl/data/SsoHandshakeProtocol.kt` | `@novasamatech/host-papp` library |
| Pairing UI | `feature/sso/impl/presentation/pairRequest/` | `OnboardingScreen.tsx` + `PairingModal` |
| Session management | `feature/sso/impl/domain/session/SsoSessionManager.kt` | `src/features/papp-provider/usePappProvider.ts` |
| Message transport | `feature/statement-store/impl/domain/sessions/RealCommunicationSession.kt` | `@novasamatech/host-papp` (closed source) |
| Request routing | `feature/sso/impl/domain/SsoService.kt` | -- |

The desktop side's core pairing/crypto logic lives in the closed-source `@novasamatech/host-papp` npm package, while the mobile side implements it directly in Kotlin.

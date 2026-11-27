# Baliza Firestore Security Specification

## 1. Data Invariants
1. A `ChatMessage` at `/rooms/{roomId}/messages/{messageId}` can only be created by an authenticated, email-verified Firebase user (`request.auth != null && request.auth.token.email_verified == true`).
2. `authUid` in any created `ChatMessage` must strictly match `request.auth.uid` (no impersonation).
3. `roomId` in the document payload must strictly match the `{roomId}` path parameter, and both `{roomId}` and `{messageId}` must pass `isValidId()`.
4. `createdAt` must equal `request.time` (server timestamp integrity).
5. `text` must be between 1 and 180 characters; `senderName` max 24 chars; `senderEmoji` max 16 chars; `senderRole` in `['seeker', 'hider']`; `channel` in `['all', 'team']`.
6. Messages are immutable once created (`allow update, delete: if false`).
7. Collection `list` queries on `/rooms/{roomId}/messages` are restricted to signed-in users and scoped via `resource.data.roomId == roomId`.

## 2. The "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read on `/rooms/room1/messages/msg1`.
2. Unauthenticated create on `/rooms/room1/messages/msg1`.
3. Create with unverified email (`email_verified: false`).
4. Identity spoofing: `authUid != request.auth.uid`.
5. Path poisoning: `roomId = "../../bad"` or >128 chars.
6. Room mismatch: document `roomId: "other"` written under `/rooms/room1/messages/msg1`.
7. Shadow/ghost field injection: adding `isAdmin: true` or `systemFlag: true`.
8. Missing required field: omitting `text` or `createdAt`.
9. Oversized payload: `text` with >180 characters.
10. Invalid enum: `channel: "secret"` or `senderRole: "admin"`.
11. Forged client timestamp: `createdAt` not equal to `request.time`.
12. Mutating/deleting an existing chat message (`update` or `delete` on `/rooms/room1/messages/msg1`).

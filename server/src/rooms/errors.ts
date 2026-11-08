import type { ErrorCode } from '@kuckuckskind/shared';

/** Fehler, der als `error`-Nachricht an den Client geht. */
export class RoomError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

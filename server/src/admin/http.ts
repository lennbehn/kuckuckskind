import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ADMIN_TOKEN_HEADER,
  PresetInputSchema,
  RoomConfigInputSchema,
  tryResolveConfig,
  type ConfigOverride,
  type PresetSummary,
  type Preset,
} from '@kuckuckskind/shared';
import type { Logger } from '../log.ts';
import { RoomError } from '../rooms/errors.ts';
import type { RoomManager } from '../rooms/manager.ts';
import type { AdminAuth, AdminIdentity } from './auth.ts';
import type { PresetStore } from './presets.ts';

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const summary = (p: Preset): PresetSummary => ({
  presetId: p.presetId,
  version: p.version,
  name: p.name,
  description: p.description,
  createdAt: p.createdAt,
  ...(p.createdBy ? { createdBy: p.createdBy } : {}),
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Anfrage zu groß');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Kein gültiges JSON');
  }
}

function checkOverride(override: unknown): ConfigOverride {
  const result = tryResolveConfig(override as ConfigOverride);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(
      400,
      issue ? `${issue.path.join('.')}: ${issue.message}` : 'Ungültige Werte',
    );
  }
  return override as ConfigOverride;
}

export interface AdminApiDeps {
  rooms: RoomManager;
  presets: PresetStore;
  auth: AdminAuth;
  log: Logger;
}

/**
 * HTTP-Schnittstelle für Admin-Bereich und Preset-Auswahl (siehe shared/src/admin/api.ts).
 * Gibt `false` zurück, wenn die Anfrage nicht hierher gehört.
 */
export function createAdminApi({ rooms, presets, auth, log }: AdminApiDeps) {
  async function requireAdmin(req: IncomingMessage): Promise<AdminIdentity> {
    const raw = req.headers[ADMIN_TOKEN_HEADER];
    const token = Array.isArray(raw) ? raw[0] : raw;
    const who = await auth.verify(token);
    if (!who) throw new HttpError(401, 'Bitte anmelden');
    return who;
  }

  function roomOr404(code: string) {
    const room = rooms.rooms.get(code.toUpperCase());
    if (!room) throw new HttpError(404, `Raum ${code} gibt es nicht`);
    return room;
  }

  async function route(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const method = req.method ?? 'GET';
    const parts = path.split('/').filter(Boolean); // ['api', 'admin', …]

    // Öffentlich: Preset-Namen für die Lobby.
    if (method === 'GET' && path === '/api/presets') {
      return send(res, 200, (await presets.listLatest()).map(summary));
    }

    if (parts[1] !== 'admin') throw new HttpError(404, 'Nicht gefunden');
    const who = await requireAdmin(req);
    const [, , resource, id, sub] = parts;

    if (method === 'GET' && resource === 'me')
      return send(res, 200, { name: who.name, mode: auth.mode });

    if (resource === 'presets') {
      if (method === 'GET' && !id) return send(res, 200, (await presets.listLatest()).map(summary));
      if (method === 'GET' && id) return send(res, 200, await presets.versions(id));
      if (method === 'POST' && !id) {
        const parsed = PresetInputSchema.safeParse(await readJson(req));
        if (!parsed.success)
          throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Ungültig');
        checkOverride(parsed.data.override);
        const saved = await presets.save(parsed.data, who.name);
        log.info('preset gespeichert', {
          presetId: saved.presetId,
          version: saved.version,
          by: who.name,
        });
        return send(res, 201, saved);
      }
    }

    if (resource === 'rooms') {
      if (method === 'GET' && !id) {
        return send(
          res,
          200,
          [...rooms.rooms.values()].map((r) => r.summary()),
        );
      }
      if (method === 'GET' && id && !sub) {
        const room = roomOr404(id);
        room.watch();
        return send(res, 200, room.debugView());
      }
      if (method === 'POST' && id && sub === 'config') {
        const room = roomOr404(id);
        const parsed = RoomConfigInputSchema.safeParse(await readJson(req));
        if (!parsed.success) throw new HttpError(400, 'Ungültige Angabe');
        const input = parsed.data;
        if (input.kind === 'default') {
          room.applyPreset({}, null);
        } else if (input.kind === 'custom') {
          room.applyPreset(checkOverride(input.override), {
            presetId: null,
            name: input.label ?? 'Eigene Werte (Admin)',
            version: null,
          });
        } else {
          const preset = await presets.get(input.presetId, input.version);
          if (!preset) throw new HttpError(404, 'Preset nicht gefunden');
          room.applyPreset(preset.override as ConfigOverride, {
            presetId: preset.presetId,
            name: preset.name,
            version: preset.version,
          });
        }
        log.info('raum-konfiguration geändert', {
          room: room.code,
          by: who.name,
          kind: input.kind,
        });
        return send(res, 200, room.debugView());
      }
    }
    throw new HttpError(404, 'Nicht gefunden');
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (!path.startsWith('/api/')) return false;
    try {
      await route(req, res, path);
    } catch (err) {
      if (err instanceof HttpError) send(res, err.status, { error: err.message });
      else if (err instanceof RoomError) send(res, 409, { error: err.message, code: err.code });
      else {
        log.error('admin-api fehler', { path, err: String(err) });
        send(res, 500, { error: 'Interner Fehler' });
      }
    }
    return true;
  };
}

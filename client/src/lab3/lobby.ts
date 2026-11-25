import { z } from 'zod';
import { fetchJson } from './assets.ts';

const RoomsSchema = z.array(z.object({
  id: z.string(),
  name: z.string(),
  asteroids: z.number().int().nonnegative()
}));

export type LobbyRoom = z.infer<typeof RoomsSchema>[number];

export class Lobby {
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;

  start(onRooms: (rooms: LobbyRoom[]) => void, onFailure: (message: string) => void): void {
    this.stop();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const refresh = async () => {
      try {
        const request = AbortSignal.any([signal, AbortSignal.timeout(4000)]);
        const result = RoomsSchema.safeParse(await fetchJson('/api/rooms', request));
        // The Lab 04 server lists active rooms. Lab 03 needs its arena presets.
        const rooms = result.success && result.data.length > 0 ? result.data :
          RoomsSchema.parse(await fetchJson('/api/rooms.json', request));
        if (!signal.aborted) onRooms(rooms);
      } catch (error: unknown) {
        if (!signal.aborted) onFailure(error instanceof Error ? error.message : String(error));
      } finally {
        if (!signal.aborted) this.timer = setTimeout(refresh, 5000);
      }
    };
    void refresh();
  }

  stop(): void {
    this.controller?.abort();
    clearTimeout(this.timer);
  }
}

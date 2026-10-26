import type { FSchedule, MasterRoom } from "../types";

/** Add only the registered type of an actually booked companion room.
 *  A course requirement alone is never proof of a reservation. */
export function enrichCompanionRoomTypes<T extends Pick<FSchedule, "companionRoomId">>(
  rows: readonly T[],
  registryRooms: readonly Pick<MasterRoom, "id" | "roomType">[],
): Array<T & { companionRoomType?: string }> {
  const types = new Map(registryRooms.map(room => [String(room.id), String(room.roomType || "").trim()]));
  return rows.map(row => {
    const id = String(row.companionRoomId || "").trim();
    if (!id) return row;
    const type = types.get(id);
    return type ? { ...row, companionRoomType: type } : row;
  });
}

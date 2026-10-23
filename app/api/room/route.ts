import { env } from "cloudflare:workers";
import { handleRoom } from "@/lib/room-service";

export async function POST(request: Request) {
  return handleRoom(request, env.DB);
}

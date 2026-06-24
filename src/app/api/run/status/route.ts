import { NextResponse } from "next/server";
import { getStatus } from "@/lib/run-lock";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getStatus());
}

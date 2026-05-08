import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTripById } from "@/lib/db/queries/trips";
import { sql } from "@/lib/db/client";
import { callLLM, parseJsonFromLLM } from "@/lib/llm/provider";
import { SG1_SYSTEM_PROMPT, buildSG1UserPrompt } from "@/lib/llm/prompts/sg1";
import { apiError, Errors } from "@/lib/errors";
import type { SG1Response } from "@/lib/llm/prompts/sg1";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const { id } = await params;
    const trip = await getTripById(id);
    if (!trip) return apiError(Errors.notFound("Trip"));

    const userId = (session.user as { id?: string }).id;
    if (trip.userId !== userId) return apiError(Errors.forbidden());

    const rawText = await callLLM(SG1_SYSTEM_PROMPT, buildSG1UserPrompt(trip));
    const parsed = parseJsonFromLLM<SG1Response>(rawText);

    if (!parsed.options?.length) {
      return apiError(Errors.badRequest("LLM returned no trip options"));
    }

    // Store each option
    const rows = await Promise.all(
      parsed.options.map((option) =>
        sql`
          INSERT INTO trip_raw_options (trip_id, llm_raw_plan_json)
          VALUES (${id}, ${JSON.stringify(option)})
          RETURNING id, trip_id, llm_raw_plan_json, selected, created_at
        `.then((r) => r[0]),
      ),
    );

    return NextResponse.json({ options: rows }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const { id } = await params;
    const rows = await sql`
      SELECT * FROM trip_raw_options WHERE trip_id = ${id} ORDER BY created_at DESC
    `;

    return NextResponse.json({ options: rows });
  } catch (error) {
    return apiError(error);
  }
}

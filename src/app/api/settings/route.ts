import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserById, updateUserPreferences } from "@/lib/db/queries/users";
import { apiError, Errors } from "@/lib/errors";
import type { UserPreferences } from "@/types";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const userId = (session.user as { id?: string }).id;
    if (!userId) return apiError(Errors.unauthorized());

    const user = await getUserById(userId);
    if (!user) return apiError(Errors.notFound("User"));

    return NextResponse.json({
      notificationEmail: user.notificationEmail,
      defaultCurrency: user.defaultCurrency,
      timezone: user.timezone,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const userId = (session.user as { id?: string }).id;
    if (!userId) return apiError(Errors.unauthorized());

    const body = (await request.json()) as Partial<UserPreferences>;

    const prefs: UserPreferences = {
      notificationEmail: body.notificationEmail ?? true,
      defaultCurrency: body.defaultCurrency ?? "USD",
      timezone: body.timezone ?? "UTC",
    };

    const user = await updateUserPreferences(userId, prefs);

    return NextResponse.json({
      notificationEmail: user.notificationEmail,
      defaultCurrency: user.defaultCurrency,
      timezone: user.timezone,
    });
  } catch (error) {
    return apiError(error);
  }
}

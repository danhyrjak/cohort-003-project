import { Link } from "react-router";
import { data, isRouteErrorResponse } from "react-router";
import * as v from "valibot";
import type { Route } from "./+types/admin.instructor.$instructorId.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole } from "~/db/schema";
import {
  getAnalyticsSummary,
  getRevenueTimeSeries,
  getCourseBreakdown,
  type AnalyticsPeriod,
} from "~/services/analyticsService";
import { AlertTriangle } from "lucide-react";
import { AnalyticsDashboard } from "~/components/AnalyticsDashboard";

const VALID_PERIODS = ["7d", "30d", "12m", "all"] as const;
const DEFAULT_PERIOD: AnalyticsPeriod = "30d";

const periodSchema = v.fallback(
  v.picklist(VALID_PERIODS),
  DEFAULT_PERIOD
);

const paramsSchema = v.object({
  instructorId: v.pipe(v.string(), v.transform(Number), v.integer()),
});

export function meta({ data: loaderData }: Route.MetaArgs) {
  const name = loaderData?.instructorName ?? "Instructor";
  return [
    { title: `${name}'s Analytics — Cadence` },
    { name: "description", content: `Revenue and enrollment analytics for ${name}` },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Sign in to view analytics.", { status: 401 });
  }

  const currentUser = getUserById(currentUserId);

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  const parsed = v.safeParse(paramsSchema, params);
  if (!parsed.success) {
    throw data("Invalid instructor ID.", { status: 400 });
  }

  const instructorId = parsed.output.instructorId;
  const instructor = getUserById(instructorId);

  if (!instructor) {
    throw data("Instructor not found.", { status: 404 });
  }

  if (instructor.role !== UserRole.Instructor) {
    throw data("This user is not an instructor.", { status: 400 });
  }

  const url = new URL(request.url);
  const period = v.parse(periodSchema, url.searchParams.get("period") ?? undefined);

  const summary = getAnalyticsSummary(instructorId, period);
  const timeSeries = getRevenueTimeSeries(instructorId, period);
  const courseBreakdown = getCourseBreakdown(instructorId, period);

  return {
    summary,
    timeSeries,
    courseBreakdown,
    period,
    instructorName: instructor.name,
    instructorId,
  };
}

export default function AdminInstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { summary, timeSeries, courseBreakdown, period, instructorName } = loaderData;

  return (
    <AnalyticsDashboard
      summary={summary}
      timeSeries={timeSeries}
      courseBreakdown={courseBreakdown}
      period={period}
      instructorName={instructorName}
      backLink={{ to: "/admin/users", label: "Manage Users" }}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else if (error.status === 404) {
      title = "Not found";
      message =
        typeof error.data === "string" ? error.data : "Instructor not found.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/admin/users">
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Manage Users
          </button>
        </Link>
      </div>
    </div>
  );
}

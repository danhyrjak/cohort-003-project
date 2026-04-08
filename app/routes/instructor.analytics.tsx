import { Link } from "react-router";
import { data, isRouteErrorResponse } from "react-router";
import * as v from "valibot";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole } from "~/db/schema";
import {
  getAnalyticsSummary,
  type AnalyticsPeriod,
} from "~/services/analyticsService";
import { cn } from "~/lib/utils";
import { AlertTriangle, Star, TrendingUp, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

const VALID_PERIODS = ["7d", "30d", "12m", "all"] as const;
const DEFAULT_PERIOD: AnalyticsPeriod = "30d";

const periodSchema = v.fallback(
  v.picklist(VALID_PERIODS),
  DEFAULT_PERIOD
);

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  "12m": "12 Months",
  all: "All Time",
};

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "Your revenue and enrollment analytics" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Sign in to view analytics.", { status: 401 });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Instructor) {
    throw data("Only instructors can access analytics.", { status: 403 });
  }

  const url = new URL(request.url);
  const period = v.parse(periodSchema, url.searchParams.get("period") ?? undefined);

  const summary = getAnalyticsSummary(currentUserId, period);

  return { summary, period };
}

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { summary, period } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            Your revenue and enrollment overview
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border p-1">
          {VALID_PERIODS.map((p) => (
            <Link
              key={p}
              to={`?period=${p}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(summary.totalRevenue / 100).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Enrollments
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalEnrollments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Rating
            </CardTitle>
            <Star className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.averageRating !== null
                ? `${summary.averageRating.toFixed(1)} / 5`
                : "—"}
            </div>
            {summary.ratingCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.ratingCount}{" "}
                {summary.ratingCount === 1 ? "rating" : "ratings"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
          : "You don't have permission to access this page.";
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
        <Link to="/instructor">
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            My Courses
          </button>
        </Link>
      </div>
    </div>
  );
}

import { Link } from "react-router";
import { data, isRouteErrorResponse } from "react-router";
import * as v from "valibot";
import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole } from "~/db/schema";
import {
  getAnalyticsSummary,
  getRevenueTimeSeries,
  getCourseBreakdown,
  type AnalyticsPeriod,
  type CourseBreakdown,
} from "~/services/analyticsService";
import { cn, formatPrice } from "~/lib/utils";
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, Star, TrendingUp, Users } from "lucide-react";
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

type SortKey = keyof Pick<
  CourseBreakdown,
  "revenue" | "salesCount" | "enrollmentCount" | "averageRating" | "listPrice"
>;

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
  const timeSeries = getRevenueTimeSeries(currentUserId, period);
  const courseBreakdown = getCourseBreakdown(currentUserId, period);

  return { summary, timeSeries, courseBreakdown, period };
}

// ─── Chart (client-only) ──────────────────────────────────────────────────────

function useIsClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  return isClient;
}

function RevenueChart({
  data,
  period,
}: {
  data: { date: string; revenue: number }[];
  period: AnalyticsPeriod;
}) {
  const isClient = useIsClient();
  const isMonthly = period === "12m" || period === "all";

  if (!isClient) {
    return (
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">No revenue data for this period.</p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: isMonthly
      ? d.date.slice(0, 7) // YYYY-MM
      : d.date.slice(5),   // MM-DD
    revenueDisplay: d.revenue / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={formatted} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={50}
        />
        <Tooltip
          formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
          labelFormatter={(label) => label}
        />
        <Line
          type="monotone"
          dataKey="revenueDisplay"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Sortable Table ───────────────────────────────────────────────────────────

function CourseTable({ courses }: { courses: CourseBreakdown[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  if (courses.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">No course data for this period.</p>
      </div>
    );
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...courses].sort((a, b) => {
    const aVal = a[sortKey] ?? -1;
    const bVal = b[sortKey] ?? -1;
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline size-3 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="ml-1 inline size-3" />
      : <ChevronDown className="ml-1 inline size-3" />;
  }

  function SortHeader({
    col,
    children,
    className,
  }: {
    col: SortKey;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <th
        className={cn(
          "cursor-pointer select-none whitespace-nowrap px-4 py-3 text-right text-xs font-medium text-muted-foreground hover:text-foreground",
          className
        )}
        onClick={() => handleSort(col)}
      >
        {children}
        <SortIcon col={col} />
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Course
            </th>
            <SortHeader col="listPrice">List Price</SortHeader>
            <SortHeader col="revenue">Revenue</SortHeader>
            <SortHeader col="salesCount">Sales</SortHeader>
            <SortHeader col="enrollmentCount">Enrollments</SortHeader>
            <SortHeader col="averageRating">Avg Rating</SortHeader>
          </tr>
        </thead>
        <tbody>
          {sorted.map((course, i) => (
            <tr key={course.courseId} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/20")}>
              <td className="px-4 py-3 font-medium">{course.title}</td>
              <td className="px-4 py-3 text-right">{formatPrice(course.listPrice)}</td>
              <td className="px-4 py-3 text-right">${(course.revenue / 100).toFixed(2)}</td>
              <td className="px-4 py-3 text-right">{course.salesCount}</td>
              <td className="px-4 py-3 text-right">{course.enrollmentCount}</td>
              <td className="px-4 py-3 text-right">
                {course.averageRating !== null
                  ? `${course.averageRating.toFixed(1)} (${course.ratingCount})`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  const { summary, timeSeries, courseBreakdown, period } = loaderData;

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

      {/* Summary Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
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

      {/* Revenue Chart */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base font-medium">Revenue Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart data={timeSeries} period={period} />
        </CardContent>
      </Card>

      {/* Per-Course Table */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Course Breakdown</h2>
        <CourseTable courses={courseBreakdown} />
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

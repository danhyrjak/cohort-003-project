import { Link } from "react-router";
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
import type { AnalyticsPeriod, AnalyticsSummary, RevenueDataPoint, CourseBreakdown } from "~/services/analyticsService";
import { cn, formatPrice } from "~/lib/utils";
import { ArrowUpDown, ChevronDown, ChevronUp, Star, TrendingUp, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export const VALID_PERIODS = ["7d", "30d", "12m", "all"] as const;

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  "12m": "12 Months",
  all: "All Time",
};

type SortKey = keyof Pick<
  CourseBreakdown,
  "revenue" | "salesCount" | "enrollmentCount" | "averageRating" | "listPrice"
>;

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
  data: RevenueDataPoint[];
  period: AnalyticsPeriod;
}) {
  const isClient = useIsClient();
  const isMonthly = period === "12m" || period === "all";

  if (!isClient) {
    return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
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

// ─── Shared Dashboard ─────────────────────────────────────────────────────────

export interface AnalyticsDashboardProps {
  summary: AnalyticsSummary;
  timeSeries: RevenueDataPoint[];
  courseBreakdown: CourseBreakdown[];
  period: AnalyticsPeriod;
  /** Breadcrumb and title context */
  instructorName?: string;
  backLink?: { to: string; label: string };
}

export function AnalyticsDashboard({
  summary,
  timeSeries,
  courseBreakdown,
  period,
  instructorName,
  backLink,
}: AnalyticsDashboardProps) {
  const hasNoCourses = courseBreakdown.length === 0;
  const hasNoActivityInPeriod =
    !hasNoCourses &&
    summary.totalRevenue === 0 &&
    summary.totalEnrollments === 0 &&
    summary.ratingCount === 0;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        {backLink && (
          <>
            <span className="mx-2">/</span>
            <Link to={backLink.to} className="hover:text-foreground">
              {backLink.label}
            </Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {instructorName ? `${instructorName}'s Analytics` : "Analytics"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {instructorName
              ? `Revenue and enrollment overview for ${instructorName}`
              : "Your revenue and enrollment overview"}
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

      {hasNoCourses ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <TrendingUp className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="mb-2 text-lg font-semibold">No courses yet</h2>
          <p className="text-sm text-muted-foreground">
            {instructorName
              ? `${instructorName} hasn't published any courses yet.`
              : "Publish a course to start tracking analytics."}
          </p>
        </div>
      ) : (
        <>
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

          {/* No-activity notice */}
          {hasNoActivityInPeriod && (
            <div className="mb-8 rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No revenue, enrollments, or ratings recorded for this period. Try selecting a wider time range.
              </p>
            </div>
          )}

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
        </>
      )}
    </div>
  );
}

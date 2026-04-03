import { useState, useEffect } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/admin.comments";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { UserRole, CommentStatus } from "~/db/schema";
import {
  getReportedComments,
  getCommentById,
  resolveComment,
} from "~/services/commentService";
import type { ReportedComment } from "~/services/commentService";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import { AlertTriangle, CheckCircle2, Flag, MessageCircle, XCircle } from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import { parseParams } from "~/lib/validation";

export function meta() {
  return [
    { title: "Reported Comments — Cadence Admin" },
    { name: "description", content: "Review and resolve reported comments" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const user = getUserById(currentUserId);
  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  const comments = getReportedComments();
  return { comments };
}

const resolveParamsSchema = z.object({
  commentId: z.coerce.number().int(),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) throw data("You must be logged in.", { status: 401 });

  const user = getUserById(currentUserId);
  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can resolve comments.", { status: 403 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const { commentId } = parseParams(
    { commentId: String(formData.get("commentId") ?? "") },
    resolveParamsSchema
  );

  const comment = getCommentById(commentId);
  if (!comment || comment.status !== CommentStatus.Reported) {
    throw data("Reported comment not found.", { status: 404 });
  }

  const adminReason = String(formData.get("adminReason") ?? "").trim() || null;

  if (intent === "approve-comment") {
    resolveComment(commentId, CommentStatus.Approved, adminReason);
    return { success: true };
  }

  if (intent === "decline-comment") {
    resolveComment(commentId, CommentStatus.Declined, adminReason);
    return { success: true };
  }

  throw data("Invalid action.", { status: 400 });
}

export default function AdminComments({ loaderData }: Route.ComponentProps) {
  const { comments } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Reported Comments</span>
      </nav>

      <div className="mb-6 flex items-center gap-3">
        <Flag className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Reported Comments</h1>
          <p className="mt-1 text-muted-foreground">
            Review comments reported by instructors and take action
          </p>
        </div>
      </div>

      {/* Admin nav links */}
      <div className="mb-6 flex gap-3 text-sm">
        <Link to="/admin/courses" className="text-muted-foreground hover:text-foreground">
          Courses
        </Link>
        <Link to="/admin/users" className="text-muted-foreground hover:text-foreground">
          Users
        </Link>
        <Link to="/admin/categories" className="text-muted-foreground hover:text-foreground">
          Categories
        </Link>
        <span className="font-medium text-foreground">Comments</span>
      </div>

      {comments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 size-8 opacity-40" />
            <p>No reported comments to review.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {comments.length} reported comment{comments.length !== 1 ? "s" : ""} awaiting review
          </p>
          <div className="space-y-4">
            {comments.map((comment) => (
              <ReportedCommentCard key={comment.id} comment={comment} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReportedCommentCard({ comment }: { comment: ReportedComment }) {
  const fetcher = useFetcher({ key: `resolve-${comment.id}` });
  const [adminReason, setAdminReason] = useState("");

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Comment resolved.");
    }
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const isBusy = fetcher.state !== "idle";

  return (
    <Card>
      <CardContent className="p-4">
        {/* Context breadcrumb */}
        <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Link
            to={`/instructor/${comment.courseId}`}
            className="hover:text-foreground hover:underline"
          >
            {comment.courseTitle}
          </Link>
          <span>/</span>
          <span>{comment.lessonTitle}</span>
        </div>

        {/* Comment author + body */}
        <div className="flex items-start gap-3 mb-4">
          <UserAvatar
            name={comment.authorName}
            avatarUrl={comment.authorAvatarUrl}
            className="mt-0.5 size-8 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-medium">{comment.authorName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(comment.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <p className="text-sm text-foreground">{comment.body}</p>
          </div>
        </div>

        {/* Instructor's report reason */}
        {comment.reportReason && (
          <div className="mb-4 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400 mb-0.5">
              Reported because:
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-300">
              {comment.reportReason}
            </p>
          </div>
        )}

        {/* Admin reason textarea */}
        <div className="mb-3">
          <Textarea
            value={adminReason}
            onChange={(e) => setAdminReason(e.target.value)}
            placeholder="Optional: enter a reason for your decision"
            rows={2}
            className="text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="approve-comment" />
            <input type="hidden" name="commentId" value={comment.id} />
            <input type="hidden" name="adminReason" value={adminReason} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
              disabled={isBusy}
            >
              <CheckCircle2 className="mr-1.5 size-3.5" />
              Approve
            </Button>
          </fetcher.Form>

          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="decline-comment" />
            <input type="hidden" name="commentId" value={comment.id} />
            <input type="hidden" name="adminReason" value={adminReason} />
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={isBusy}
            >
              <XCircle className="mr-1.5 size-3.5" />
              Decline
            </Button>
          </fetcher.Form>
        </div>
      </CardContent>
    </Card>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

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
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button variant="outline">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}

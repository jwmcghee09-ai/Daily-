import { getAuthenticatedUser } from "@/lib/auth";
import SignInPage from "@/components/auth/sign-in-page";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SignInRoute(props: { searchParams: SearchParams }) {
  const user = await getAuthenticatedUser();
  const searchParams = await props.searchParams;
  const plan = readSingleParam(searchParams.plan);
  const flow = readSingleParam(searchParams.flow);
  const token = readSingleParam(searchParams.token);
  const initialSubMode = flow === "reset" ? "reset" : "default";
  const initialResetToken = flow === "reset" && token ? token : "";
  /*
   * Where to return after signing in.
   *
   * Only a same-origin path, and never one that starts with "//" — a protocol-
   * relative URL reads as a path and navigates off-site, which is how a sign-in
   * page becomes a phishing redirect.
   */
  const requestedNext = readSingleParam(searchParams.next);
  const nextPath = requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : null;

  return (
    <SignInPage
      authenticatedUser={user ? { email: user.email, displayName: user.displayName } : null}
      initialMode={readSingleParam(searchParams.mode) === "register" ? "register" : "login"}
      initialPlan={plan === "pro" ? "pro" : plan === "plus" ? "plus" : plan === "free" ? "free" : null}
      verificationState={readSingleParam(searchParams.verified)}
      initialSubMode={initialSubMode}
      initialResetToken={initialResetToken}
      nextPath={nextPath}
    />
  );
}

function readSingleParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? null;
  }

  return null;
}

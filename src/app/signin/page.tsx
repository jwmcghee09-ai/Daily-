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

  return (
    <SignInPage
      authenticatedUser={user ? { email: user.email, displayName: user.displayName } : null}
      initialMode={readSingleParam(searchParams.mode) === "register" ? "register" : "login"}
      initialPlan={plan === "pro" ? "pro" : plan === "plus" ? "plus" : plan === "free" ? "free" : null}
      verificationState={readSingleParam(searchParams.verified)}
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
